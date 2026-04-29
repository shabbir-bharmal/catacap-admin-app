-- Migration: Investment Update Sent Confirmation email template
-- Date: 2026-04-29
-- Purpose: Adds the "Investment Update Sent Confirmation" email template
--          (category 40) used to notify the Investment Owner once per send
--          when an admin sends an Investment Update to investors. Replaces
--          the previous behavior of CC'ing the owner on every per-investor
--          email — the owner now receives a single confirmation message
--          (with support@catacap.org also on the recipient list) telling
--          them the Update has been sent to all investors of the campaign.
--
-- Idempotent: uses WHERE NOT EXISTS so re-runs are no-ops. Mirrors the
-- style of the existing Investment Update Notification migration in
-- releases/23_04_2026/migrations/2026_04_23_campaign_updates.sql.

INSERT INTO email_templates (name, subject, body_html, category, status, is_deleted, created_at, receiver, trigger_action)
SELECT
  'Investment Update Sent Confirmation',
  '[Update - {{updateSubject}}]',
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
            <p style="margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#16a34a;">Investment update sent</p>
            <h1 style="margin:0 0 16px; font-family:Georgia,'Times New Roman',serif; font-size:28px; font-weight:700; line-height:1.25; color:#111;">Your Update is on its way</h1>
            <p style="margin:0; font-size:16px; line-height:1.75; color:#374151;">This Update has been sent to all the investors of <strong style="color:#16a34a;">{{campaignName}}</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff; padding:36px 48px;">
            <p style="margin:0 0 16px; font-size:13px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#16a34a;">📣 Update subject</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0faf4; border:1px solid #bbf7d0; border-radius:8px; margin-bottom:28px;">
              <tbody><tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#111; font-weight:600;">{{updateSubject}}</p>
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
            <p style="margin:0; font-size:12px; color:#9ca3af;">You are receiving this confirmation because you are the Investment Owner.</p>
          </td>
        </tr>
      </tbody></table>
    </td>
  </tr>
</tbody></table>$body$,
  40,
  2,
  false,
  NOW(),
  'Investment owner',
  'When a Super Admin sends an Investment Update to investors'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'Investment Update Sent Confirmation');

-- Backfill receiver/trigger_action for any prior installs that inserted the
-- template before these fields were populated.
UPDATE email_templates
   SET receiver = 'Investment owner',
       trigger_action = 'When a Super Admin sends an Investment Update to investors'
 WHERE name = 'Investment Update Sent Confirmation'
   AND (receiver IS NULL OR trigger_action IS NULL);

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration, run the statements below (wrapped in a transaction).
-- This will permanently remove the "Investment Update Sent Confirmation"
-- email template.
--
-- BEGIN;
--
-- DELETE FROM email_templates WHERE name = 'Investment Update Sent Confirmation';
--
-- COMMIT;
-- =============================================================================
