/**
 * Investment Match Grants helper
 *
 * When a recommendation for a campaign is approved this module checks
 * whether any active (non-expired) match grant covers that campaign and,
 * if the donor is different from the investor, automatically allocates
 * the matched amount.
 *
 * Escrow model
 * ─────────────
 * If the grant has a total_cap (reserved_amount > 0) the funds were
 * already deducted from the donor's wallet at grant-creation time.
 * Matching therefore only:
 *   • increments amount_used
 *   • creates an approved recommendation for the donor
 *   • logs activity
 *   No further wallet change is needed.
 *
 * Unlimited grants (no total_cap, reserved_amount = 0)
 * ────────────────────────────────────────────────────
 * Funds are drawn from the donor's live wallet balance at match time.
 *
 * Called fire-and-forget AFTER the investor's recommendation transaction
 * has committed.
 */

import pool from "../db.js";

interface ApplyMatchArgs {
  campaignId: number;
  investorUserId: string;
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
    campaignName,
  } = args;

  try {
    // ── Guardrail: never match a recommendation that was itself created by
    // a match grant. Prevents chain-matching (e.g. FundHer's donor recommendation
    // being matched by Lily's grant, or vice versa).
    const isMatchCreated = await pool.query(
      `SELECT 1 FROM campaign_match_grant_activity
        WHERE donor_recommendation_id = $1 LIMIT 1`,
      [triggeringRecommendationId],
    );
    if (isMatchCreated.rows.length > 0) {
      console.log(
        `applyMatchGrants: skipping rec ${triggeringRecommendationId} on campaign ${campaignId} — created by a match grant (no chain matching).`,
      );
      return;
    }

    // Find active, non-expired grants covering this campaign
    const grantsResult = await pool.query(
      `SELECT cmg.id, cmg.donor_user_id, cmg.total_cap, cmg.amount_used,
              cmg.reserved_amount, cmg.match_type, cmg.per_investment_cap,
              cmg.name, cmg.expires_at
         FROM campaign_match_grants cmg
         JOIN campaign_match_grant_campaigns cmgc
              ON cmgc.match_grant_id = cmg.id AND cmgc.campaign_id = $1
        WHERE cmg.is_active = TRUE
          AND cmg.donor_user_id != $2
          AND (cmg.expires_at IS NULL OR cmg.expires_at > NOW())
        ORDER BY cmg.id ASC`,
      [campaignId, investorUserId],
    );

    if (grantsResult.rows.length === 0) return;

    // Filter out grants that already have a match (pending or approved) for this recommendation
    const alreadyMatchedResult = await pool.query(
      `SELECT DISTINCT match_grant_id FROM campaign_match_grant_activity
        WHERE triggered_by_recommendation_id = $1`,
      [triggeringRecommendationId],
    );
    const alreadyMatched = new Set(alreadyMatchedResult.rows.map((r: any) => r.match_grant_id));

    for (const grant of grantsResult.rows) {
      if (alreadyMatched.has(grant.id)) continue;
      await applySingleGrant({
        grant,
        campaignId,
        investorUserId,
        triggeringRecommendationId,
        investmentAmount,
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
    const reserved = parseFloat(grant.reserved_amount) || 0;
    const amountUsed = parseFloat(grant.amount_used) || 0;
    const isEscrow = reserved > 0; // funds already taken from wallet at creation

    // ── Determine available budget ────────────────────────────────────
    let availableBudget: number;
    if (isEscrow) {
      availableBudget = Math.max(0, reserved - amountUsed);
    } else if (grant.total_cap != null) {
      // Capped but no reservation (edge case — treat as escrow exhausted)
      availableBudget = Math.max(
        0,
        parseFloat(grant.total_cap) - amountUsed,
      );
    } else {
      availableBudget = Infinity; // unlimited — will be capped by wallet below
    }

    if (availableBudget <= 0) return;

    // ── Compute match amount ──────────────────────────────────────────
    let matchAmount = investmentAmount;

    if (grant.match_type === "capped" && grant.per_investment_cap != null) {
      matchAmount = Math.min(matchAmount, parseFloat(grant.per_investment_cap));
    }
    matchAmount = Math.min(matchAmount, availableBudget);
    matchAmount = Math.round(matchAmount * 100) / 100;

    if (matchAmount <= 0) return;

    await client.query("BEGIN");

    // Fetch donor row (always needed for recommendation fields)
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
    const donorFullName =
      `${donor.first_name || ""} ${donor.last_name || ""}`.trim() ||
      donor.user_name ||
      "";

    if (!isEscrow) {
      // ── Live-wallet model: check and deduct ──────────────────────
      if (donorBalance <= 0) {
        await client.query("ROLLBACK");
        console.warn(
          `applyMatchGrants: donor ${grant.donor_user_id} has zero balance, skipping grant ${grant.id}`,
        );
        return;
      }
      if (donorBalance < matchAmount) {
        matchAmount = Math.round(donorBalance * 100) / 100;
      }
      const newBalance = parseFloat((donorBalance - matchAmount).toFixed(2));

      await client.query(
        `UPDATE users SET account_balance = $1 WHERE id = $2`,
        [newBalance, donor.id],
      );
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
          newBalance,
        ],
      );
    } else {
      // ── Escrow model: no wallet change, but still log the activity ──
      const escrowDonorRes = await client.query(
        `SELECT account_balance, user_name FROM users WHERE id = $1`,
        [grant.donor_user_id],
      );
      if (escrowDonorRes.rows.length > 0) {
        const escrowBalance = parseFloat(escrowDonorRes.rows[0].account_balance) || 0;
        await client.query(
          `INSERT INTO account_balance_change_logs
             (user_id, payment_type, investment_name, campaign_id,
              old_value, user_name, new_value, change_date, comment)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
          [
            grant.donor_user_id,
            `Match grant – escrow applied`,
            campaignName,
            campaignId,
            escrowBalance,
            escrowDonorRes.rows[0].user_name || "",
            escrowBalance,
            `$${matchAmount.toFixed(2)} matched from escrow via grant "${grant.name || `Grant #${grant.id}`}"`,
          ],
        );
      }
    }

    // ── Create pending recommendation for donor ──────────────────────
    const recResult = await client.query(
      `INSERT INTO recommendations
         (user_email, user_full_name, campaign_id, status, amount, date_created, user_id)
       VALUES ($1, $2, $3, 'pending', $4, NOW(), $5)
       RETURNING id`,
      [donor.email, donorFullName, campaignId, matchAmount, donor.id],
    );
    const donorRecId = recResult.rows[0]?.id ?? null;

    // ── Update amount_used ────────────────────────────────────────────
    await client.query(
      `UPDATE campaign_match_grants
          SET amount_used = amount_used + $1,
              updated_at  = NOW()
        WHERE id = $2`,
      [matchAmount, grant.id],
    );

    // ── Log activity ──────────────────────────────────────────────────
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
      `applyMatchGrants: grant ${grant.id} matched $${matchAmount} for campaign ${campaignId} (${isEscrow ? "escrow" : "live-wallet"})`,
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
