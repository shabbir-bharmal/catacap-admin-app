import type pg from "pg";
import pool from "../db.js";
import { sendTemplateEmail } from "./emailService.js";

const TEMPLATE_NEW_INVESTMENT = 16; // "Campaign Investment Notification"

export interface InvestmentNotificationRecipient {
  id?: number;
  name: string;
  email: string;
}

export async function getInvestmentNotificationRecipients(
  campaignId: number,
): Promise<InvestmentNotificationRecipient[]> {
  try {
    const result = await pool.query(
      `SELECT id, name, email
         FROM campaign_investment_notification_recipients
        WHERE campaign_id = $1
        ORDER BY position, id`,
      [campaignId],
    );
    return result.rows.map((r: any) => ({
      id: Number(r.id),
      name: r.name || "",
      email: r.email || "",
    }));
  } catch (err: any) {
    if (err?.code === "42P01") return [];
    throw err;
  }
}

/**
 * Replace the full list of notification recipients for a campaign.
 * Runs DELETE + INSERTs inside the caller's transaction so it stays
 * consistent with the surrounding campaign update.
 *
 * Empty/blank emails or emails without "@" are silently skipped.
 * Duplicate emails (case-insensitive) are de-duplicated.
 */
export async function replaceInvestmentNotificationRecipients(
  client: pg.PoolClient,
  campaignId: number,
  recipients: Array<{ name?: string | null; email?: string | null }> | null | undefined,
): Promise<void> {
  await client.query(
    `DELETE FROM campaign_investment_notification_recipients WHERE campaign_id = $1`,
    [campaignId],
  );
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  const seen = new Set<string>();
  let position = 0;
  for (const r of recipients) {
    const email = String(r?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    const name = String(r?.name ?? "").trim();
    await client.query(
      `INSERT INTO campaign_investment_notification_recipients
         (campaign_id, name, email, position)
       VALUES ($1, $2, $3, $4)`,
      [campaignId, name, email, position],
    );
    position += 1;
  }
}

/**
 * Send a "new investor" notification email to every recipient
 * configured for the campaign. If no recipients are configured the
 * function falls back to the legacy single-recipient column
 * (investment_informational_email, then contact_info_email_address).
 *
 * Best-effort: per-recipient errors are logged but never thrown; the
 * caller's investment write is never rolled back because of email
 * delivery problems.
 */
export async function sendNewInvestmentNotifications(args: {
  campaignId: number;
  donorDisplayName: string;
  amount?: number | null;
}): Promise<void> {
  const { campaignId, donorDisplayName, amount } = args;
  try {
    const campaignRes = await pool.query(
      `SELECT id, name, property,
              contact_info_email_address,
              investment_informational_email
         FROM campaigns
        WHERE id = $1
        LIMIT 1`,
      [campaignId],
    );
    const campaign = campaignRes.rows[0];
    if (!campaign) return;

    const recipients = await getInvestmentNotificationRecipients(campaignId);

    let toSend: InvestmentNotificationRecipient[] = recipients;
    if (toSend.length === 0) {
      const fallback = String(
        campaign.investment_informational_email ||
          campaign.contact_info_email_address ||
          "",
      )
        .trim()
        .toLowerCase();
      if (fallback && fallback.includes("@")) {
        toSend = [{ name: "", email: fallback }];
      }
    }

    if (toSend.length === 0) return;

    const requestOrigin =
      process.env.REQUEST_ORIGIN || process.env.VITE_FRONTEND_URL || "";
    const logoUrl = process.env.LOGO_URL || "";
    const investmentLink = campaign.property
      ? `${requestOrigin.replace(/\/$/, "")}/investments/${campaign.property}`
      : requestOrigin || "";

    const seen = new Set<string>();
    for (const r of toSend) {
      const email = (r.email || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      try {
        await sendTemplateEmail(TEMPLATE_NEW_INVESTMENT, email, {
          logoUrl,
          investorDisplayName: donorDisplayName || "An investor",
          donorName: donorDisplayName || "An investor",
          campaignName: campaign.name || "",
          investmentLink,
          recipientName: r.name || "",
          amount: amount != null ? String(amount) : "",
        });
      } catch (emailErr: any) {
        console.error(
          `sendNewInvestmentNotifications: failed for ${email}:`,
          emailErr?.message || emailErr,
        );
      }
    }
  } catch (err: any) {
    console.error(
      "sendNewInvestmentNotifications: unexpected error:",
      err?.message || err,
    );
  }
}
