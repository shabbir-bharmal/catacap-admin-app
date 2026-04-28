-- Migration: Add page_url column to events table
-- Date: 2026-04-24
-- Purpose:
--   Adds a nullable `page_url` column to the `events` table so admins
--   can record the link to each event's page on catacap.org. The field
--   is optional; client-side validation enforces that any value provided
--   contains `catacap.org`. Existing rows will have NULL for this column.
--
-- Run this BEFORE deploying the application code that reads/writes the
-- new `page_url` column.

BEGIN;

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS page_url TEXT;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration, run:
--
-- BEGIN;
-- ALTER TABLE events DROP COLUMN IF EXISTS page_url;
-- COMMIT;
-- =============================================================================
