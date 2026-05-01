-- Migration: Per-campaign new-investment notification recipients
-- Date: 2026-04-30
-- Purpose:
--   Stores 0..N name/email pairs per investment (campaign) that should
--   receive an email notification whenever a new investor invests in
--   that campaign. Today the notification (when present) goes only to
--   campaigns.investment_informational_email (a single address). This
--   table replaces that single-recipient model with a list, while
--   keeping the legacy column as a fallback when the list is empty.
--
--   Notification email uses email_templates id = 16
--   ("Campaign Investment Notification").
--
--   Schema:
--     id           SERIAL  PRIMARY KEY
--     campaign_id  INTEGER NOT NULL  -> FK to campaigns(id) ON DELETE CASCADE
--     name         TEXT    NOT NULL  (may be empty string for unnamed entries)
--     email        TEXT    NOT NULL  (lower-cased, must contain '@')
--     position     INTEGER NOT NULL DEFAULT 0  (display order)
--     created_at   TIMESTAMP NOT NULL DEFAULT NOW()
--
--   Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--   Safe to run repeatedly. The PUT /api/admin/investment/:id route
--   replaces the full set for a campaign on each save (DELETE then
--   INSERT inside the same transaction).

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_investment_notification_recipients (
    id          SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name   = 'campaign_investment_notification_recipients'
          AND constraint_name = 'campaign_investment_notification_recipients_campaign_id_fkey'
    ) THEN
        ALTER TABLE campaign_investment_notification_recipients
            ADD CONSTRAINT campaign_investment_notification_recipients_campaign_id_fkey
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cinr_campaign_id
    ON campaign_investment_notification_recipients (campaign_id);

COMMIT;

-- Rollback (uncomment to revert):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_cinr_campaign_id;
-- DROP TABLE IF EXISTS campaign_investment_notification_recipients;
-- COMMIT;
