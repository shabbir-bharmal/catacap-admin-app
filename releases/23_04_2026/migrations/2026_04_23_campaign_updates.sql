-- Migration: Investment Updates feature
-- Date: 2026-04-23
-- Purpose: Create the `campaign_updates` table used by the new Investment
--          "Updates" tab. Each row represents an admin-authored update for
--          a specific Investment (campaign), with a subject, description
--          (rich-text HTML), short subject and short description (used as
--          the title/body of the in-app notification), an optional attached
--          image, and a start/end visibility window.
--
-- Notification fan-out (one row per investor in `user_notifications`) is
-- handled by the application code; no schema changes are needed there.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_updates (
    id                SERIAL       PRIMARY KEY,
    campaign_id       INTEGER      NOT NULL REFERENCES campaigns(id),
    subject           TEXT         NOT NULL,
    description       TEXT,
    short_subject     TEXT,
    short_description TEXT,
    attach_file       TEXT,
    start_date        TIMESTAMP,
    end_date          TIMESTAMP,
    is_deleted        BOOLEAN      NOT NULL DEFAULT false,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- For deployments where the table already existed without the short_* columns.
ALTER TABLE campaign_updates ADD COLUMN IF NOT EXISTS short_subject TEXT;
ALTER TABLE campaign_updates ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Tracks when in-app notifications have been fanned out for this update.
-- Notifications fire on the update's start_date (or immediately on create
-- if start_date is in the past / null). The CampaignUpdateNotifications
-- scheduler job picks up rows where this column is still NULL and the
-- start_date has been reached.
ALTER TABLE campaign_updates ADD COLUMN IF NOT EXISTS notifications_sent_at TIMESTAMP NULL;

-- Original filename for the attached file (PDF, DOC, image, etc.) so the
-- email attachment can be sent under a meaningful name even though the
-- stored object uses a UUID filename.
ALTER TABLE campaign_updates ADD COLUMN IF NOT EXISTS attach_file_name TEXT;
-- Treat all pre-existing rows as already fanned-out so we don't re-notify.
UPDATE campaign_updates
   SET notifications_sent_at = COALESCE(created_at, NOW())
 WHERE notifications_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_updates_campaign_id
    ON campaign_updates (campaign_id);

COMMIT;

-- =============================================================================
-- Email template: "Investment Update Notification" (category 39)
-- =============================================================================
-- Used by the manual "Send email" action on each Investment Update (admin tab).
-- Sent via Resend to every distinct investor of the campaign, with the
-- Investment Owner CC'd. Inserted only if a template with this name does not
-- already exist (idempotent re-runs).

INSERT INTO email_templates (name, subject, body_html, category, status, is_deleted, created_at, receiver, trigger_action)
SELECT
  'Investment Update Notification',
  '📣 Update on {{campaignName}}: {{updateSubject}}',
  $body$<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e5e5e5; padding:40px 20px; font-family:'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <tbody><tr>
    <td align="center">
      <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px; width:100%; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <tbody><tr>
          <td style="background-color:#ffffff; border-radius:12px 12px 0 0; padding:32px 48px 24px; border-bottom:2px solid #e6f0ea; text-align:center;">
            <a href="https://catacap.org" target="_blank" style="text-decoration:none;">
              <img src="https://catacapstorage.blob.core.windows.net/prodcontainer/logo-for-email.png" alt="CataCap Logo" width="300" height="150" style="display:block; margin:0 auto;">
            </a>
            <div style="width:48px; height:3px; background:linear-gradient(90deg,#16a34a,#4ade80); margin:12px auto 0;"></div>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff; padding:36px 48px 32px; border-left:4px solid #16a34a; border-bottom:2px solid #e6f0ea;">
            <p style="margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#16a34a;">Investment update</p>
            <h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:28px; font-weight:700; line-height:1.25; color:#111;">Hi {{firstName}},</h1>
            <p style="margin:0; font-size:16px; line-height:1.75; color:#374151;">There's a new update from <strong style="color:#16a34a;">{{campaignName}}</strong>, an investment you backed through CataCap.</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff; padding:36px 48px;">
            <p style="margin:0 0 16px; font-size:13px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#16a34a;">📣 {{updateSubject}}</p>
            {{updateImageHtml}}
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0faf4; border:1px solid #bbf7d0; border-radius:8px; margin-bottom:28px;">
              <tbody><tr>
                <td style="padding:20px 24px;">
                  <div style="margin:0 0 16px; font-size:15px; line-height:1.75; color:#374151;">{{updateDescription}}</div>
                  <p style="margin:0;"><a href="{{campaignUrl}}" style="display:inline-block; font-size:14px; font-weight:700; color:#ffffff; background-color:#16a34a; padding:10px 20px; border-radius:6px; text-decoration:none;">🔗 View the investment</a></p>
                </td>
              </tr>
            </tbody></table>
            <p style="margin:0 0 2px; font-size:15px; font-weight:700; color:#111;">Onward,</p>
            <p style="margin:0 0 20px; font-size:15px; font-weight:700; color:#111;">The CataCap Team</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff; border-radius:0 0 12px 12px; padding:24px 48px; border-top:2px solid #e6f0ea; text-align:center;">
            <p style="margin:0; font-size:12px; color:#9ca3af;"><a href="https://catacap.org/settings" target="_blank" style="color:#9ca3af; text-decoration:underline;">Unsubscribe</a> from CataCap notifications.</p>
          </td>
        </tr>
      </tbody></table>
    </td>
  </tr>
</tbody></table>$body$,
  39,
  2,
  false,
  NOW(),
  'Investment investor',
  'When a Super Admin posts an Investment Update'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'Investment Update Notification');

-- Backfill receiver/trigger_action for any prior installs that inserted the
-- template before these fields were populated.
UPDATE email_templates
   SET receiver = 'Investment investor',
       trigger_action = 'When a Super Admin posts an Investment Update'
 WHERE name = 'Investment Update Notification'
   AND (receiver IS NULL OR trigger_action IS NULL);

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration, run the statements below (wrapped in a transaction).
-- This will permanently drop the `campaign_updates` table and all its data.
--
-- BEGIN;
--
-- DELETE FROM email_templates WHERE name = 'Investment Update Notification';
-- DROP INDEX IF EXISTS idx_campaign_updates_campaign_id;
-- DROP TABLE IF EXISTS campaign_updates;
--
-- COMMIT;
-- =============================================================================
