-- Migration: Link email logs to their owning scheduler run
-- Date: 2026-04-22
-- Purpose:
--   1. Allow scheduler_logs.end_time to be NULL so a row can be inserted
--      at the start of a run and updated at the end (needed for the new
--      "insert at start, update at end" lifecycle in sendReminderEmail
--      and welcomeSeries).
--   2. Add a nullable scheduler_log_id FK + index to scheduled_email_logs
--      and welcome_series_email_logs so each email log row is associated
--      directly with its scheduler run (instead of being inferred by a
--      fragile sent_date / sent_at time window, which breaks for the
--      reminder email queue because rows are inserted asynchronously
--      after the scheduler run has already written its end_time).
--   3. Backfill scheduler_log_id for historical email log rows by
--      attributing each row to the scheduler run whose [start_time,
--      next_run.start_time) window contains the row's sent timestamp.
--
-- Run this BEFORE deploying the scheduler / admin modal changes that
-- thread schedulerLogId through queueEmail / welcomeSeries inserts and
-- filter the "View" modal endpoints by scheduler_log_id.

BEGIN;

-- 1) Allow scheduler_logs.end_time to be NULL during an in-progress run.
ALTER TABLE scheduler_logs
    ALTER COLUMN end_time DROP NOT NULL;

-- 2) scheduled_email_logs: add nullable FK + index to scheduler_logs.
ALTER TABLE scheduled_email_logs
    ADD COLUMN IF NOT EXISTS scheduler_log_id INTEGER
        REFERENCES scheduler_logs(id);

CREATE INDEX IF NOT EXISTS idx_scheduled_email_logs_scheduler_log_id
    ON scheduled_email_logs(scheduler_log_id);

-- 3) welcome_series_email_logs: add nullable FK + index to scheduler_logs.
ALTER TABLE welcome_series_email_logs
    ADD COLUMN IF NOT EXISTS scheduler_log_id INTEGER
        REFERENCES scheduler_logs(id);

CREATE INDEX IF NOT EXISTS idx_welcome_series_email_logs_scheduler_log_id
    ON welcome_series_email_logs(scheduler_log_id);

-- 4) Backfill historical scheduled_email_logs rows.
WITH ranked AS (
    SELECT id,
           job_name,
           start_time,
           LEAD(start_time) OVER (
               PARTITION BY job_name
               ORDER BY start_time
           ) AS next_start
      FROM scheduler_logs
     WHERE job_name = 'SendReminderEmail'
)
UPDATE scheduled_email_logs sel
   SET scheduler_log_id = r.id
  FROM ranked r
 WHERE sel.scheduler_log_id IS NULL
   AND sel.sent_date >= r.start_time
   AND (r.next_start IS NULL OR sel.sent_date < r.next_start);

-- 5) Backfill historical welcome_series_email_logs rows.
WITH ranked AS (
    SELECT id,
           job_name,
           start_time,
           LEAD(start_time) OVER (
               PARTITION BY job_name
               ORDER BY start_time
           ) AS next_start
      FROM scheduler_logs
     WHERE job_name = 'WelcomeSeries'
)
UPDATE welcome_series_email_logs wsel
   SET scheduler_log_id = r.id
  FROM ranked r
 WHERE wsel.scheduler_log_id IS NULL
   AND wsel.sent_at >= r.start_time
   AND (r.next_start IS NULL OR wsel.sent_at < r.next_start);

COMMIT;
