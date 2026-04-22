-- Migration: Welcome Series email tracking + scheduler_logs metadata
-- Date: 2026-04-22
-- Purpose:
--   1. Add a generic `metadata` JSONB column to `scheduler_logs` so all
--      scheduler jobs (WelcomeSeries, SendReminderEmail) can record
--      per-run counters in a uniform way.
--   2. Backfill SendReminderEmail rows by copying the existing
--      day3_email_count / week2_email_count values into metadata.
--   3. Drop the SendReminderEmail-specific dedicated columns
--      (day3_email_count, week2_email_count) so the schema stays clean.
--   4. Create the `welcome_series_email_logs` table used by the
--      WelcomeSeries scheduler job to track which welcome emails have
--      been sent to which Learn More form submissions, preventing
--      duplicate sends across runs/manual triggers.
--
-- Run this BEFORE deploying the WelcomeSeries / SendReminderEmail
-- scheduler changes.

BEGIN;

-- 1) scheduler_logs.metadata column
ALTER TABLE scheduler_logs
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2) Backfill SendReminderEmail rows from dedicated columns into metadata
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scheduler_logs'
          AND column_name = 'day3_email_count'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scheduler_logs'
          AND column_name = 'week2_email_count'
    ) THEN
        UPDATE scheduler_logs
           SET metadata = jsonb_build_object(
                   'day3',  COALESCE(day3_email_count,  0),
                   'week2', COALESCE(week2_email_count, 0)
               )
         WHERE job_name = 'SendReminderEmail'
           AND metadata IS NULL;
    END IF;
END $$;

-- 3) Drop the now-unused dedicated counter columns
ALTER TABLE scheduler_logs
    DROP COLUMN IF EXISTS day3_email_count,
    DROP COLUMN IF EXISTS week2_email_count;

-- 4) welcome_series_email_logs table
CREATE TABLE IF NOT EXISTS welcome_series_email_logs (
    id                 SERIAL PRIMARY KEY,
    form_submission_id INTEGER   NOT NULL,
    day_offset         INTEGER   NOT NULL,
    sent_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    success            BOOLEAN   NOT NULL,
    error_message      TEXT,
    UNIQUE (form_submission_id, day_offset)
);

INSERT INTO "public"."scheduler_configurations" ("id", "job_name", "description", "hour", "minute", "timezone", "is_enabled", "created_at", "updated_at") VALUES (751, 'WelcomeSeries', 'Sends Day 1, Day 6, and Day 10 welcome emails to Learn More form submitters', 9, 0, 'America/New_York', true, '2026-04-22 10:35:49.797639', '2026-04-22 11:01:16.788083');

COMMIT;
