-- Migration: Add show_on_home column to events table
-- Date: 2026-04-28
-- Purpose:
--   Adds a non-nullable `show_on_home` boolean column to the `events`
--   table so admins can opt out of showing a given event on the public
--   home page. The new column defaults to TRUE so:
--     * Existing rows are backfilled to TRUE (preserves current
--       home-page behavior — nothing disappears unexpectedly).
--     * New rows created without an explicit value continue to
--       appear on the home page by default, matching the form
--       default in the admin Event Management page.
--
--   The public upcoming events endpoint
--   (`GET /api/event` in `server/src/routes/publicEvents.ts`) is
--   updated in the same release to filter on
--   `show_on_home = true` in addition to the existing active +
--   upcoming filters. The admin Event Management list (and edit
--   dialog) continue to show events regardless of this flag.
--
-- Run this BEFORE deploying the application code that reads/writes
-- the new `show_on_home` column.

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration, run:
--
-- BEGIN;
-- ALTER TABLE events DROP COLUMN IF EXISTS show_on_home;
-- COMMIT;
-- =============================================================================
