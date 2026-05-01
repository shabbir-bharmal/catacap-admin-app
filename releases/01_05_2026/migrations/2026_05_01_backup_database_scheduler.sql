-- Migration: Register the BackupDatabase scheduler job
-- Date: 2026-05-01
-- Purpose:
--   Adds the BackupDatabase scheduler job to scheduler_configurations so it
--   appears in the admin Schedulers tab and runs on its default schedule.
--
--   The job itself (server/src/scheduler/backupDatabase.ts) takes a full
--   pg_dump of the Postgres database, gzips it, and uploads the result to
--   Supabase Storage under the dedicated `database-backups/` folder of the
--   configured bucket. Each run also writes a row to scheduler_logs;
--   successful runs include the uploaded artifact path and size in the
--   metadata JSONB column (no schema change required — the existing
--   metadata column is reused).
--
--   Default schedule: 03:30 America/New_York, daily, enabled.
--
--   Idempotent: ON CONFLICT (job_name) DO NOTHING.
--   Mirrored at runtime by ensureSchedulerTables in server/src/db.ts so
--   fresh environments self-heal on boot.
--
--   Rollback:
--     DELETE FROM scheduler_configurations WHERE job_name = 'BackupDatabase';

BEGIN;

INSERT INTO scheduler_configurations
    (job_name, description, hour, minute, timezone, is_enabled)
VALUES
    (
        'BackupDatabase',
        'Takes a full pg_dump of the database (gzipped) and uploads it to Supabase Storage under database-backups/',
        3,
        30,
        'America/New_York',
        true
    )
ON CONFLICT (job_name) DO NOTHING;

COMMIT;
