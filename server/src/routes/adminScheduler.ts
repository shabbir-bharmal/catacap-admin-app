import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { reloadScheduler, executeJobWithLock } from "../scheduler/index.js";

const router = Router();

const ALLOWED_TIMEZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "UTC",
]);

function isValidTimezone(tz: string): boolean {
  if (ALLOWED_TIMEZONES.has(tz)) return true;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const tableCheck = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'scheduler_configurations'`
    );
    if (tableCheck.rows.length === 0) {
      res.json([]);
      return;
    }
    const result = await pool.query(
      `SELECT id, job_name AS "jobName", description, hour, minute, timezone,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM scheduler_configurations
       ORDER BY id`
    );

    let retentionDays: number | null = null;
    try {
      const retentionResult = await pool.query(
        `SELECT value FROM site_configurations
         WHERE type = 'Configuration'
           AND key = 'Auto Delete Archived Records After (Days)'
           AND (is_deleted = false OR is_deleted IS NULL)
         LIMIT 1`
      );
      if (retentionResult.rows.length > 0) {
        const parsed = parseInt(retentionResult.rows[0].value, 10);
        if (!isNaN(parsed)) retentionDays = parsed;
      }
    } catch {}

    const rows = result.rows.map((row: Record<string, unknown>) => {
      if (row.jobName === "DeleteArchivedUsers" && retentionDays !== null) {
        return {
          ...row,
          description: `${row.description || "Archives and deletes soft-deleted records"} (Currently configured: ${retentionDays} days)`,
        };
      }
      return row;
    });

    res.json(rows);
  } catch (err) {
    console.error("Scheduler config list error:", err);
    res.status(500).json({ message: "Failed to load scheduler configurations." });
  }
});

router.put("/:jobName", async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    const { hour, minute, timezone } = req.body;

    if (hour == null || minute == null || !timezone) {
      res.status(400).json({ message: "hour, minute, and timezone are required." });
      return;
    }

    const h = parseInt(String(hour), 10);
    const m = parseInt(String(minute), 10);

    if (isNaN(h) || h < 0 || h > 23) {
      res.status(400).json({ message: "hour must be between 0 and 23." });
      return;
    }
    if (isNaN(m) || m < 0 || m > 59) {
      res.status(400).json({ message: "minute must be between 0 and 59." });
      return;
    }
    if (!isValidTimezone(timezone)) {
      res.status(400).json({ message: "Invalid timezone. Please select a valid IANA timezone." });
      return;
    }

    const result = await pool.query(
      `UPDATE scheduler_configurations
       SET hour = $1, minute = $2, timezone = $3, updated_at = NOW()
       WHERE job_name = $4
       RETURNING id, job_name AS "jobName", description, hour, minute, timezone,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [h, m, timezone, jobName]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Job not found." });
      return;
    }

    let reloadWarning: string | undefined;
    try {
      await reloadScheduler();
    } catch (reloadErr) {
      console.error("Scheduler reload failed after config update:", reloadErr);
      reloadWarning = "Schedule saved but the running scheduler failed to reload. Changes will take effect on next server restart.";
    }

    res.json({ success: true, data: result.rows[0], warning: reloadWarning });
  } catch (err) {
    console.error("Scheduler config update error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:jobName/trigger", async (req: Request, res: Response) => {
  try {
    const jobName = String(req.params.jobName);

    const configCheck = await pool.query(
      `SELECT id FROM scheduler_configurations WHERE job_name = $1`,
      [jobName]
    );
    if (configCheck.rows.length === 0) {
      res.status(404).json({ message: "Job not found in configurations." });
      return;
    }

    const startTime = new Date();
    try {
      const result = await executeJobWithLock(jobName);
      if (!result.executed) {
        res.json({
          success: false,
          message: `${jobName} is already running. Please try again later.`,
          startTime: startTime.toISOString(),
          endTime: new Date().toISOString(),
        });
        return;
      }
      res.json({
        success: true,
        message: `${jobName} completed successfully.`,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      res.json({
        success: false,
        message: `${jobName} failed: ${errorMessage}`,
        error: errorMessage,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Scheduler trigger error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/logs", async (req: Request, res: Response) => {
  try {
    const jobName = req.query.jobName as string | undefined;
    const rawLimit = parseInt(String(req.query.limit || "20"), 10);
    const rawOffset = parseInt(String(req.query.offset || "0"), 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

    let query: string;
    const params: unknown[] = [];

    if (jobName) {
      query = `SELECT id, job_name AS "jobName", start_time AS "startTime",
                      end_time AS "endTime", day3_email_count AS "day3EmailCount",
                      week2_email_count AS "week2EmailCount", error_message AS "errorMessage"
               FROM scheduler_logs
               WHERE job_name = $1
               ORDER BY start_time DESC
               LIMIT $2 OFFSET $3`;
      params.push(jobName, limit, offset);
    } else {
      query = `SELECT id, job_name AS "jobName", start_time AS "startTime",
                      end_time AS "endTime", day3_email_count AS "day3EmailCount",
                      week2_email_count AS "week2EmailCount", error_message AS "errorMessage"
               FROM scheduler_logs
               ORDER BY start_time DESC
               LIMIT $1 OFFSET $2`;
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);

    let totalCount = 0;
    if (jobName) {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM scheduler_logs WHERE job_name = $1`,
        [jobName]
      );
      totalCount = countResult.rows[0].count;
    } else {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM scheduler_logs`
      );
      totalCount = countResult.rows[0].count;
    }

    res.json({ logs: result.rows, total: totalCount });
  } catch (err) {
    console.error("Scheduler logs error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
