-- Migration: Investment Update email send log + multi-attachment support
-- Date: 2026-04-30
-- Purpose:
--   Adds two tables in support of the Updates tab on the admin
--   Investment edit page:
--
--   1. `campaign_update_email_logs`
--        Captures each successful "Send Email" action against an
--        Investment Update (campaign_updates row) so admins can audit
--        when an update was emailed and to how many investors.
--
--   2. `campaign_update_attachments`
--        Allows multiple files to be attached to a single Investment
--        Update (instead of the previous single `attach_file` /
--        `attach_file_name` columns on `campaign_updates`). Existing
--        rows are backfilled into this table so the UI / email sender
--        can switch over without losing data. The legacy columns are
--        kept in place for now (no DROP) but are no longer written.
--
-- Idempotency:
--   - `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
--     so re-running this migration is safe.
--   - Backfill of attachments is gated by `NOT EXISTS` so it only
--     runs the first time and never duplicates rows.

BEGIN;

-- -----------------------------------------------------------------
-- campaign_update_email_logs
-- -----------------------------------------------------------------
-- One row per successful "Send Email" admin action. Recipient count
-- reflects the number of investors the email was actually sent to
-- after applying the Pending/Rejected filter. `sent_by_user_id` is
-- nullable so background sends (or sends from an unauthenticated
-- context, which should not happen today) still record cleanly.
CREATE TABLE IF NOT EXISTS campaign_update_email_logs (
    id                  SERIAL       PRIMARY KEY,
    campaign_update_id  INTEGER      NOT NULL REFERENCES campaign_updates(id) ON DELETE CASCADE,
    campaign_id         INTEGER      NOT NULL,
    sent_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    sent_by_user_id     VARCHAR(450),
    recipient_count     INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_update_email_logs_update_id
    ON campaign_update_email_logs (campaign_update_id);

CREATE INDEX IF NOT EXISTS idx_campaign_update_email_logs_campaign_id
    ON campaign_update_email_logs (campaign_id);

-- -----------------------------------------------------------------
-- campaign_update_attachments
-- -----------------------------------------------------------------
-- Replaces the previous single `attach_file` / `attach_file_name`
-- columns on `campaign_updates`. Each row is one attachment in
-- Supabase storage (bucket: `campaigns`). `sort_order` controls the
-- display order so admins can reorder later if needed.
CREATE TABLE IF NOT EXISTS campaign_update_attachments (
    id                  SERIAL       PRIMARY KEY,
    campaign_update_id  INTEGER      NOT NULL REFERENCES campaign_updates(id) ON DELETE CASCADE,
    file_path           TEXT         NOT NULL,
    file_name           TEXT,
    mime_type           TEXT,
    size_bytes          BIGINT,
    sort_order          INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_update_attachments_update_id
    ON campaign_update_attachments (campaign_update_id);

-- -----------------------------------------------------------------
-- user_notifications.campaign_update_id
-- -----------------------------------------------------------------
-- Tags Investment Update notifications with their originating
-- campaign_updates row so the per-investor backfill (run when a new
-- investor enrolls into a campaign that already has past updates) can
-- dedupe by update identity instead of by title/url. Nullable so all
-- existing notification sources (and pre-existing rows) keep working.
ALTER TABLE user_notifications
    ADD COLUMN IF NOT EXISTS campaign_update_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_user_notifications_campaign_update_id
    ON user_notifications (target_user_id, campaign_update_id)
    WHERE campaign_update_id IS NOT NULL;

-- -----------------------------------------------------------------
-- Backfill existing single attachments into the new table so
-- nothing is lost when the application switches over. We only
-- backfill rows that don't already have an attachment row, so
-- re-running this migration is safe.
-- -----------------------------------------------------------------
INSERT INTO campaign_update_attachments (
    campaign_update_id, file_path, file_name, mime_type, size_bytes, sort_order, created_at
)
SELECT
    cu.id,
    cu.attach_file,
    COALESCE(NULLIF(TRIM(cu.attach_file_name), ''),
             regexp_replace(cu.attach_file, '^.*/', '')),
    NULL::TEXT,
    NULL::BIGINT,
    0,
    COALESCE(cu.created_at, NOW())
FROM campaign_updates cu
WHERE cu.attach_file IS NOT NULL
  AND TRIM(cu.attach_file) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM campaign_update_attachments cua
       WHERE cua.campaign_update_id = cu.id
  );

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_campaign_update_attachments_update_id;
-- DROP TABLE IF EXISTS campaign_update_attachments;
-- DROP INDEX IF EXISTS idx_campaign_update_email_logs_campaign_id;
-- DROP INDEX IF EXISTS idx_campaign_update_email_logs_update_id;
-- DROP TABLE IF EXISTS campaign_update_email_logs;
-- COMMIT;
-- =============================================================================
