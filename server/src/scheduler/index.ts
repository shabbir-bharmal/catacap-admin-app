import cron, { ScheduledTask } from "node-cron";
import pool from "../db.js";
import { runSendReminderEmail } from "./sendReminderEmail.js";
import { runDailyCleanup } from "./dailyCleanup.js";
import { runDeleteTestUsers } from "./deleteTestUsers.js";

const LOCK_KEYS: Record<string, number> = {
  SendReminderEmail: 900001,
  DeleteArchivedUsers: 900002,
  DeleteTestUsers: 900003,
};

const JOB_RUNNERS: Record<string, () => Promise<void>> = {
  SendReminderEmail: runSendReminderEmail,
  DeleteArchivedUsers: runDailyCleanup,
  DeleteTestUsers: runDeleteTestUsers,
};

const activeTasks: ScheduledTask[] = [];

async function withAdvisoryLock(
  lockKey: number,
  jobName: string,
  fn: () => Promise<void>
): Promise<void> {
  const client = await pool.connect();
  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [lockKey]
    );

    if (!lockResult.rows[0].acquired) {
      console.log(
        `[SCHEDULER] ${jobName} already running (advisory lock not acquired). Skipping.`
      );
      return;
    }

    try {
      await fn();
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [lockKey]);
    }
  } finally {
    client.release();
  }
}

async function logJobRun(
  jobName: string,
  startTime: Date,
  errorMessage: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO scheduler_logs
        (start_time, end_time, day3_email_count, week2_email_count, error_message, job_name)
       VALUES ($1, $2, 0, 0, $3, $4)`,
      [startTime, new Date(), errorMessage, jobName]
    );
  } catch (err) {
    console.error(`[SCHEDULER] Failed to log job run for ${jobName}:`, err);
  }
}

interface SchedulerConfigRow {
  job_name: string;
  hour: number;
  minute: number;
  timezone: string;
  is_enabled: boolean;
}

async function loadConfigsFromDb(): Promise<SchedulerConfigRow[]> {
  try {
    const result = await pool.query(
      `SELECT job_name, hour, minute, timezone, COALESCE(is_enabled, true) AS is_enabled FROM scheduler_configurations ORDER BY id`
    );
    return result.rows;
  } catch {
    return [];
  }
}

function getDefaultConfigs(): SchedulerConfigRow[] {
  return [
    { job_name: "SendReminderEmail", hour: 8, minute: 0, timezone: "America/New_York", is_enabled: true },
    { job_name: "DeleteArchivedUsers", hour: 2, minute: 0, timezone: "America/New_York", is_enabled: true },
    { job_name: "DeleteTestUsers", hour: 18, minute: 0, timezone: "Asia/Kolkata", is_enabled: true },
  ];
}

function scheduleJob(config: SchedulerConfigRow): void {
  const { job_name, hour, minute, timezone, is_enabled } = config;
  const runner = JOB_RUNNERS[job_name];
  const lockKey = LOCK_KEYS[job_name];

  if (!runner || lockKey == null) {
    console.log(`[SCHEDULER] Unknown job: ${job_name}, skipping.`);
    return;
  }

  if (!is_enabled) {
    console.log(
      `  - ${job_name}: DISABLED (skipping cron registration)`
    );
    return;
  }

  const cronExpression = `${minute} ${hour} * * *`;

  const task = cron.schedule(
    cronExpression,
    async () => {
      const startTime = new Date();
      console.log(`[SCHEDULER] Running ${job_name} job...`);
      await withAdvisoryLock(lockKey, job_name, async () => {
        try {
          await runner();
          if (job_name !== "SendReminderEmail") {
            await logJobRun(job_name, startTime, null);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.toString() : String(err);
          console.error(`[SCHEDULER] ${job_name} failed:`, err);
          if (job_name !== "SendReminderEmail") {
            await logJobRun(job_name, startTime, message);
          }
        }
      });
    },
    { timezone }
  );

  activeTasks.push(task);
  console.log(
    `  - ${job_name}: daily at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (${timezone})`
  );
}

export async function executeJobWithLock(jobName: string): Promise<{ executed: boolean }> {
  const runner = JOB_RUNNERS[jobName];
  const lockKey = LOCK_KEYS[jobName];

  if (!runner || lockKey == null) {
    throw new Error(`Unknown job: ${jobName}`);
  }

  const startTime = new Date();
  console.log(`[SCHEDULER] Manually triggering ${jobName} job...`);

  const client = await pool.connect();
  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [lockKey]
    );

    if (!lockResult.rows[0].acquired) {
      console.log(
        `[SCHEDULER] ${jobName} already running (advisory lock not acquired). Skipping manual trigger.`
      );
      return { executed: false };
    }

    try {
      await runner();
      if (jobName !== "SendReminderEmail") {
        await logJobRun(jobName, startTime, null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.toString() : String(err);
      console.error(`[SCHEDULER] ${jobName} failed:`, err);
      if (jobName !== "SendReminderEmail") {
        await logJobRun(jobName, startTime, message);
      }
      throw err;
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [lockKey]);
    }
  } finally {
    client.release();
  }

  return { executed: true };
}

function stopAllTasks(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
}

export async function reloadScheduler(): Promise<void> {
  console.log("[SCHEDULER] Reloading scheduler configurations...");
  stopAllTasks();

  let configs = await loadConfigsFromDb();
  if (configs.length === 0) {
    console.log("[SCHEDULER] No DB configs found, using defaults.");
    configs = getDefaultConfigs();
  }

  console.log("[SCHEDULER] Jobs registered:");
  for (const config of configs) {
    scheduleJob(config);
  }
}

export function initScheduler(): void {
  console.log("[SCHEDULER] Initializing scheduled jobs...");
  reloadScheduler().catch((err) => {
    console.error("[SCHEDULER] Failed to initialize from DB, using hardcoded defaults:", err);
    stopAllTasks();
    const defaults = getDefaultConfigs();
    console.log("[SCHEDULER] Jobs registered (defaults):");
    for (const config of defaults) {
      scheduleJob(config);
    }
  });
}
