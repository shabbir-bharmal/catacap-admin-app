-- Migration: Note attachment tables for Pending Grants and Other Assets
-- Date: 2026-04-28
-- Purpose:
--   Add support for file attachments on status-change notes for both
--   the admin Pending Grants page and the admin Other Assets
--   (asset-based payment requests) page.
--
--   Each attachment row records the original filename, the path the
--   file was written to in Supabase Storage, MIME type, size, and
--   who uploaded it / when. Rows cascade-delete with their parent
--   note so removing a note removes all of its attachments.
--
--   The application already creates these tables at startup via
--   `ensureNoteAttachmentsTables()` in `server/src/db.ts`. This
--   migration captures the same DDL in the release folder so the
--   schema change is tracked and can be applied (or rolled back)
--   independently of the application boot path.
--
-- Idempotency:
--   - `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
--     so re-running is safe.
--   - Each table is gated on its parent notes table existing
--     (`pending_grant_notes`, `asset_based_payment_request_notes`),
--     mirroring the runtime guard in `ensureNoteAttachmentsTables()`.
--
-- Run BEFORE deploying the application code that reads / writes
-- these tables (already deployed; this migration backfills the
-- release folder for parity).

BEGIN;

-- -----------------------------------------------------------------
-- pending_grant_note_attachments
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'pending_grant_notes'
    ) THEN
        CREATE TABLE IF NOT EXISTS pending_grant_note_attachments (
            id            SERIAL PRIMARY KEY,
            note_id       INTEGER NOT NULL
                          REFERENCES pending_grant_notes(id) ON DELETE CASCADE,
            file_name     TEXT NOT NULL,
            storage_path  TEXT NOT NULL,
            mime_type     TEXT,
            size_bytes    BIGINT,
            uploaded_at   TIMESTAMP DEFAULT NOW(),
            uploaded_by   VARCHAR(450)
        );

        CREATE INDEX IF NOT EXISTS idx_pending_grant_note_attachments_note_id
            ON pending_grant_note_attachments(note_id);
    END IF;
END
$$;

-- -----------------------------------------------------------------
-- asset_based_payment_request_note_attachments
-- -----------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = 'asset_based_payment_request_notes'
    ) THEN
        CREATE TABLE IF NOT EXISTS asset_based_payment_request_note_attachments (
            id            SERIAL PRIMARY KEY,
            note_id       INTEGER NOT NULL
                          REFERENCES asset_based_payment_request_notes(id) ON DELETE CASCADE,
            file_name     TEXT NOT NULL,
            storage_path  TEXT NOT NULL,
            mime_type     TEXT,
            size_bytes    BIGINT,
            uploaded_at   TIMESTAMP DEFAULT NOW(),
            uploaded_by   VARCHAR(450)
        );

        CREATE INDEX IF NOT EXISTS idx_asset_based_payment_request_note_attachments_note_id
            ON asset_based_payment_request_note_attachments(note_id);
    END IF;
END
$$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS pending_grant_note_attachments;
-- DROP TABLE IF EXISTS asset_based_payment_request_note_attachments;
-- COMMIT;
-- =============================================================================
