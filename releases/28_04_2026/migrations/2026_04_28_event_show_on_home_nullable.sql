-- Migration: Make events.show_on_home nullable
-- Date: 2026-04-28
-- Purpose:
--   Per product decision, the "Show on Home Page" flag must be a true
--   tri-state value: TRUE (show on home), FALSE (do not show on home),
--   or NULL (admin has not made an explicit choice yet).
--
--   The earlier same-day migration
--   (`2026_04_28_event_show_on_home.sql`) added the column as
--   `BOOLEAN NOT NULL DEFAULT TRUE`, which forced every row to be
--   either TRUE or FALSE and silently coerced unspecified payloads
--   to TRUE. This follow-up migration:
--     * Drops the NOT NULL constraint so the column can hold NULL.
--     * Drops the DEFAULT so new rows that do not explicitly
--       provide `show_on_home` are stored as NULL rather than
--       silently defaulting to TRUE (or to the FALSE that the
--       column default was later changed to outside the migration
--       system).
--
--   Existing TRUE / FALSE values are preserved unchanged.
--
--   Application-side, the public upcoming events endpoint
--   (`GET /api/event` in `server/src/routes/publicEvents.ts`)
--   continues to filter on `show_on_home = true`, so rows with
--   NULL or FALSE are excluded from the public home page (only
--   explicit TRUE shows). The admin Event Management list still
--   shows every row regardless of `show_on_home`.
--
-- Run this BEFORE deploying the application code that treats
-- `show_on_home` as a tri-state value.

BEGIN;

ALTER TABLE events
    ALTER COLUMN show_on_home DROP NOT NULL;

ALTER TABLE events
    ALTER COLUMN show_on_home DROP DEFAULT;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration, run:
--
-- BEGIN;
-- UPDATE events SET show_on_home = TRUE WHERE show_on_home IS NULL;
-- ALTER TABLE events ALTER COLUMN show_on_home SET DEFAULT TRUE;
-- ALTER TABLE events ALTER COLUMN show_on_home SET NOT NULL;
-- COMMIT;
-- =============================================================================
