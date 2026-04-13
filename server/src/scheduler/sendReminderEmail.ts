import pool from "../db.js";
import { queueEmail } from "./emailQueue.js";

const EMAIL_CATEGORY = {
  DAFReminderDay3: 10,
  FoundationReminderWeek2: 11,
  DAFReminderImpactAssetsDay3: 31,
  DAFReminderImpactAssetsWeek2: 32,
  DAFReminderWeek2: 33,
  FoundationReminderDay3: 34,
} as const;

const isProduction = process.env.NODE_ENV === "production";
const BASE_URL = isProduction
  ? "https://catacap.org"
  : "https://qa.catacap.org";

async function getDafLink(dafProviderName: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT provider_url FROM daf_providers
     WHERE LOWER(provider_name) = $1 AND is_active = true
     LIMIT 1`,
    [dafProviderName.toLowerCase()],
  );
  return result.rows.length > 0 ? result.rows[0].provider_url : null;
}

function formatAmount(amount: number): string {
  return (
    "$" +
    amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function getDAFCategory(reminderType: string, dafProviderName: string): number {
  if (dafProviderName === "ImpactAssets") {
    return reminderType === "Day3"
      ? EMAIL_CATEGORY.DAFReminderImpactAssetsDay3
      : EMAIL_CATEGORY.DAFReminderImpactAssetsWeek2;
  }
  return reminderType === "Day3"
    ? EMAIL_CATEGORY.DAFReminderDay3
    : EMAIL_CATEGORY.DAFReminderWeek2;
}

function getFoundationCategory(reminderType: string): number {
  return reminderType === "Day3"
    ? EMAIL_CATEGORY.FoundationReminderDay3
    : EMAIL_CATEGORY.FoundationReminderWeek2;
}

export async function runSendReminderEmail(): Promise<void> {
  const jobName = "SendReminderEmail";
  let day3Count = 0;
  let week2Count = 0;
  let errorMessage: string | null = null;
  const startTime = new Date();

  try {
    const queryParams: unknown[] = [];
    let paramIndex = 0;

    let pendingGrantsQuery = `
      SELECT
        pg.id AS pending_grant_id,
        pg.user_id,
        pg.amount,
        pg.daf_provider,
        pg.daf_name,
        pg.campaign_id,
        pg.status,
        pg.created_date,
        (CURRENT_DATE - pg.created_date::date) AS days_diff,
        u.email AS user_email,
        u.first_name AS user_first_name,
        c.name AS campaign_name,
        c.contact_info_full_name AS campaign_contact_name,
        c.property AS campaign_property
      FROM pending_grants pg
      JOIN users u ON u.id = pg.user_id
      LEFT JOIN campaigns c ON c.id = pg.campaign_id
      WHERE pg.status = 'pending'
        AND pg.created_date IS NOT NULL
        AND (
          (CURRENT_DATE - pg.created_date::date) = 3
          OR (CURRENT_DATE - pg.created_date::date) = 14
        )
        AND (pg.is_deleted = false OR pg.is_deleted IS NULL)
    `;

    if (!isProduction) {
      const emailList = process.env.EMAIL_LIST_FOR_SCHEDULER;
      if (!emailList) {
        console.log(
          "[SCHEDULER] EMAIL_LIST_FOR_SCHEDULER not set in non-production. Skipping.",
        );
        return;
      }
      const emails: string[] = emailList
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (emails.length === 0) {
        console.log("[SCHEDULER] EMAIL_LIST_FOR_SCHEDULER is empty. Skipping.");
        return;
      }

      paramIndex++;
      pendingGrantsQuery += ` AND LOWER(u.email) = ANY($${paramIndex})`;
      queryParams.push(emails);
    }

    const pendingGrants =
      queryParams.length > 0
        ? await pool.query(pendingGrantsQuery, queryParams)
        : await pool.query(pendingGrantsQuery);

    for (const grant of pendingGrants.rows) {
      const daysDiff = parseInt(grant.days_diff, 10);
      const reminderType = daysDiff === 3 ? "Day3" : "Week2";

      if (reminderType === "Day3") day3Count++;
      if (reminderType === "Week2") week2Count++;

      try {
        const dafProvider = (grant.daf_provider || "").trim().toLowerCase();

        if (dafProvider && dafProvider !== "foundation grant") {
          const dafProviderLink = await getDafLink(dafProvider);
          const amount = parseFloat(grant.amount) || 0;
          const category = getDAFCategory(
            reminderType,
            (grant.daf_provider || "").trim(),
          );

          const variables: Record<string, string> = {
            logoUrl: "",
            firstName: grant.user_first_name || "",
            amount: formatAmount(amount),
            investmentScenario: grant.campaign_name || "",
            dafProviderName: (grant.daf_provider || "").trim(),
            dafProviderLink: dafProviderLink || "",
            dafName: grant.daf_name ?? (grant.daf_provider || "").trim(),
            investmentOwnerName: grant.campaign_contact_name || "",
            investmentUrl: `${BASE_URL}/investments/${grant.campaign_property || ""}`,
            unsubscribeUrl: `${BASE_URL}/settings`,
          };

          queueEmail({
            category,
            toEmail: grant.user_email,
            variables,
            pendingGrantId: grant.pending_grant_id,
            userId: grant.user_id,
            reminderType,
          });
        } else if (dafProvider === "foundation grant") {
          const amount = parseFloat(grant.amount) || 0;
          const category = getFoundationCategory(reminderType);

          const investmentScenario = grant.campaign_name
            ? `to <b>${grant.campaign_name}</b>`
            : "to CataCap";

          const variables: Record<string, string> = {
            logoUrl: "",
            firstName: grant.user_first_name || "",
            amount: formatAmount(amount),
            investmentScenario,
            investmentOwnerName: grant.campaign_contact_name || "",
            investmentUrl: `${BASE_URL}/investments/${grant.campaign_property || ""}`,
            unsubscribeUrl: `${BASE_URL}/settings`,
          };

          queueEmail({
            category,
            toEmail: grant.user_email,
            variables,
            pendingGrantId: grant.pending_grant_id,
            userId: grant.user_id,
            reminderType,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[SCHEDULER] Error processing grant ${grant.pending_grant_id}:`,
          message,
        );
      }
    }

    console.log(
      `[SCHEDULER] SendReminderEmail complete: Day3=${day3Count}, Week2=${week2Count}, emails queued for async delivery`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.toString() : String(err);
    errorMessage = message;
    console.error("[SCHEDULER] SendReminderEmail error:", err);
  } finally {
    await pool.query(
      `INSERT INTO scheduler_logs
        (start_time, end_time, day3_email_count, week2_email_count, error_message, job_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [startTime, new Date(), day3Count, week2Count, errorMessage, jobName],
    );
  }
}
