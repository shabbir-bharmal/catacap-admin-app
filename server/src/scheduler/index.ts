import cron from "node-cron";
import pool from "../db.js";
import { runSendReminderEmail } from "./sendReminderEmail.js";
import { runDailyCleanup } from "./dailyCleanup.js";
import { runDeleteTestUsers } from "./deleteTestUsers.js";

const LOCK_KEYS = {
  SendReminderEmail: 900001,
  DeleteArchivedUsers: 900002,
  DeleteTestUsers: 900003,
} as const;

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

export function initScheduler(): void {
  console.log("[SCHEDULER] Initializing scheduled jobs...");

  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("[SCHEDULER] Running SendReminderEmail job...");
      await withAdvisoryLock(
        LOCK_KEYS.SendReminderEmail,
        "SendReminderEmail",
        async () => {
          try {
            await runSendReminderEmail();
          } catch (err) {
            console.error("[SCHEDULER] SendReminderEmail failed:", err);
          }
        }
      );
    },
    {
      timezone: "America/New_York",
    }
  );

  cron.schedule(
    "0 2 * * *",
    async () => {
      const startTime = new Date();
      console.log("[SCHEDULER] Running DeleteArchivedUsers job...");
      await withAdvisoryLock(
        LOCK_KEYS.DeleteArchivedUsers,
        "DeleteArchivedUsers",
        async () => {
          try {
            await runDailyCleanup();
            await logJobRun("DeleteArchivedUsers", startTime, null);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.toString() : String(err);
            console.error("[SCHEDULER] DeleteArchivedUsers failed:", err);
            await logJobRun("DeleteArchivedUsers", startTime, message);
          }
        }
      );
    },
    {
      timezone: "America/New_York",
    }
  );

  cron.schedule(
    "0 18 * * *",
    async () => {
      const startTime = new Date();
      console.log("[SCHEDULER] Running DeleteTestUsers job...");
      await withAdvisoryLock(
        LOCK_KEYS.DeleteTestUsers,
        "DeleteTestUsers",
        async () => {
          try {
            await runDeleteTestUsers();
            await logJobRun("DeleteTestUsers", startTime, null);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.toString() : String(err);
            console.error("[SCHEDULER] DeleteTestUsers failed:", err);
            await logJobRun("DeleteTestUsers", startTime, message);
          }
        }
      );
    },
    {
      timezone: "Asia/Kolkata",
    }
  );

  console.log("[SCHEDULER] Jobs registered:");
  console.log("  - SendReminderEmail: daily at 8:00 AM Eastern");
  console.log("  - DeleteArchivedUsers: daily at 2:00 AM Eastern");
  console.log("  - DeleteTestUsers: daily at 6:00 PM IST");
}
