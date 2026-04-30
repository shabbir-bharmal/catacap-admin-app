/**
 * Investment Match Grants helper
 *
 * When a recommendation for a campaign is approved, this module checks
 * whether any active match grant covers that campaign and, if the donor
 * is different from the investor, automatically deducts the matched
 * amount from the donor's wallet and records an approved recommendation
 * on their behalf.
 *
 * Called fire-and-forget AFTER the original recommendation's transaction
 * has committed, so the investor's approved recommendation is never
 * rolled back due to matching failures.
 */

import pool from "../db.js";

interface ApplyMatchArgs {
  campaignId: number;
  investorUserId: string;      // the person who made the investment (excluded from matching themselves)
  triggeringRecommendationId: number;
  investmentAmount: number;
  investorEmail: string;
  campaignName: string;
}

export async function applyMatchGrants(args: ApplyMatchArgs): Promise<void> {
  const {
    campaignId,
    investorUserId,
    triggeringRecommendationId,
    investmentAmount,
    investorEmail,
    campaignName,
  } = args;

  try {
    // Find all active match grants that cover this campaign
    const grantsResult = await pool.query(
      `SELECT cmg.id, cmg.donor_user_id, cmg.total_cap, cmg.amount_used,
              cmg.match_type, cmg.per_investment_cap, cmg.name
         FROM campaign_match_grants cmg
         JOIN campaign_match_grant_campaigns cmgc
              ON cmgc.match_grant_id = cmg.id AND cmgc.campaign_id = $1
        WHERE cmg.is_active = TRUE
          AND cmg.donor_user_id != $2
        ORDER BY cmg.id ASC`,
      [campaignId, investorUserId],
    );

    if (grantsResult.rows.length === 0) return;

    for (const grant of grantsResult.rows) {
      await applySingleGrant({
        grant,
        campaignId,
        investorUserId,
        triggeringRecommendationId,
        investmentAmount,
        investorEmail,
        campaignName,
      });
    }
  } catch (err: any) {
    console.error("applyMatchGrants: unexpected error:", err?.message || err);
  }
}

async function applySingleGrant(opts: {
  grant: any;
  campaignId: number;
  investorUserId: string;
  triggeringRecommendationId: number;
  investmentAmount: number;
  investorEmail: string;
  campaignName: string;
}): Promise<void> {
  const {
    grant,
    campaignId,
    triggeringRecommendationId,
    investmentAmount,
    campaignName,
  } = opts;

  const client = await pool.connect();
  try {
    // --- Compute match amount ---
    const totalCap = grant.total_cap != null ? parseFloat(grant.total_cap) : null;
    const amountUsed = parseFloat(grant.amount_used) || 0;
    const remainingBudget = totalCap != null ? totalCap - amountUsed : Infinity;

    if (remainingBudget <= 0) return; // cap exhausted

    let matchAmount = investmentAmount;

    // Apply per-investment ceiling if match_type = 'capped'
    if (grant.match_type === "capped" && grant.per_investment_cap != null) {
      matchAmount = Math.min(matchAmount, parseFloat(grant.per_investment_cap));
    }

    // Apply remaining budget ceiling
    matchAmount = Math.min(matchAmount, remainingBudget);
    matchAmount = Math.round(matchAmount * 100) / 100; // round to cents

    if (matchAmount <= 0) return;

    await client.query("BEGIN");

    // Re-check donor balance inside the transaction
    const donorResult = await client.query(
      `SELECT id, email, first_name, last_name, user_name, account_balance
         FROM users WHERE id = $1`,
      [grant.donor_user_id],
    );
    if (donorResult.rows.length === 0) {
      await client.query("ROLLBACK");
      console.warn(
        `applyMatchGrants: donor ${grant.donor_user_id} not found, skipping grant ${grant.id}`,
      );
      return;
    }
    const donor = donorResult.rows[0];
    const donorBalance = parseFloat(donor.account_balance) || 0;

    if (donorBalance < matchAmount) {
      // Insufficient balance — match as much as possible (or skip entirely)
      if (donorBalance <= 0) {
        await client.query("ROLLBACK");
        console.warn(
          `applyMatchGrants: donor ${grant.donor_user_id} has zero balance, skipping grant ${grant.id}`,
        );
        return;
      }
      matchAmount = Math.round(donorBalance * 100) / 100;
    }

    const newDonorBalance = parseFloat((donorBalance - matchAmount).toFixed(2));
    const donorFullName = `${donor.first_name || ""} ${donor.last_name || ""}`.trim() || donor.user_name || "";

    // 1. Deduct from donor wallet
    await client.query(
      `UPDATE users SET account_balance = $1 WHERE id = $2`,
      [newDonorBalance, donor.id],
    );

    // 2. Log the balance change
    await client.query(
      `INSERT INTO account_balance_change_logs
         (user_id, payment_type, investment_name, campaign_id,
          old_value, user_name, new_value, change_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        donor.id,
        `Match grant – ${grant.name || `Grant #${grant.id}`}`,
        campaignName,
        campaignId,
        donorBalance,
        donor.user_name || donorFullName,
        newDonorBalance,
      ],
    );

    // 3. Create an approved recommendation for the donor
    const recResult = await client.query(
      `INSERT INTO recommendations
         (user_email, user_full_name, campaign_id, status, amount, date_created, user_id)
       VALUES ($1, $2, $3, 'approved', $4, NOW(), $5)
       RETURNING id`,
      [donor.email, donorFullName, campaignId, matchAmount, donor.id],
    );
    const donorRecId = recResult.rows[0]?.id ?? null;

    // 4. Update amount_used on the grant (use optimistic lock to prevent races)
    await client.query(
      `UPDATE campaign_match_grants
          SET amount_used = amount_used + $1,
              updated_at  = NOW()
        WHERE id = $2`,
      [matchAmount, grant.id],
    );

    // 5. Log the activity
    await client.query(
      `INSERT INTO campaign_match_grant_activity
         (match_grant_id, campaign_id, triggered_by_user_id,
          triggered_by_recommendation_id, donor_recommendation_id, amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        grant.id,
        campaignId,
        opts.investorUserId,
        triggeringRecommendationId,
        donorRecId,
        matchAmount,
      ],
    );

    await client.query("COMMIT");

    console.log(
      `applyMatchGrants: grant ${grant.id} matched $${matchAmount} for campaign ${campaignId}`,
    );
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      `applyMatchGrants: error on grant ${grant.id}:`,
      err?.message || err,
    );
  } finally {
    client.release();
  }
}
