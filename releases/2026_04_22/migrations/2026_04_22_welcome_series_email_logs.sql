-- Migration: Welcome Series email tracking
-- Date: 2026-04-22
-- Purpose:
--   1. Add a `metadata` JSONB column to `scheduler_logs` so the
--      WelcomeSeries scheduler job can record per-day email counts
--      ({day1, day6, day10}) on each run.
--   2. Create the `welcome_series_email_logs` table used by the
--      WelcomeSeries scheduler job to track which welcome emails have
--      been sent to which Learn More form submissions, preventing
--      duplicate sends across runs/manual triggers.
--
-- Run this BEFORE deploying the WelcomeSeries scheduler changes.

BEGIN;

-- 1) scheduler_logs.metadata column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'scheduler_logs'
          AND column_name = 'metadata'
    ) THEN
        ALTER TABLE scheduler_logs ADD COLUMN metadata JSONB;
    END IF;
END $$;

-- 2) welcome_series_email_logs table
CREATE TABLE IF NOT EXISTS welcome_series_email_logs (
    id                 SERIAL PRIMARY KEY,
    form_submission_id INTEGER   NOT NULL,
    day_offset         INTEGER   NOT NULL,
    sent_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    success            BOOLEAN   NOT NULL,
    error_message      TEXT,
    UNIQUE (form_submission_id, day_offset)
);

COMMIT;
