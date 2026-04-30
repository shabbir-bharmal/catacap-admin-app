-- Migration: Investment Update — Impact Highlights
-- Date: 2026-04-30
-- Purpose:
--   Adds a single JSONB column `impact_highlights` to `campaign_updates`
--   that stores up to three free-form { label, value } pairs entered by
--   an admin in the New Update / Edit Update modal on the admin
--   Investment edit page (Updates tab).
--
--   Storage shape:
--     impact_highlights = [
--       { "label": "...", "value": "..." },
--       { "label": "...", "value": "..." },
--       { "label": "...", "value": "..." }
--     ]
--
--   The frontend always renders exactly three rows in the modal; empty
--   rows are persisted as { "label": "", "value": "" } so the slot
--   ordering is stable across edits. Consumers should treat any row
--   where both label and value are blank as "unused".
--
-- Idempotency:
--   - `ADD COLUMN IF NOT EXISTS` so re-running this migration is safe.
--   - No backfill required: existing rows default to NULL, which the
--     backend / frontend treat as "no highlights".

BEGIN;

ALTER TABLE campaign_updates
    ADD COLUMN IF NOT EXISTS impact_highlights JSONB;

COMMIT;
