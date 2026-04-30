import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

// ------------------------------------------------------------------ //
// Shared helper: reserve cap from donor wallet inside an open txn
// ------------------------------------------------------------------ //
async function reserveCapFromWallet(
  client: any,
  donorUserId: string,
  capAmount: number,
  grantName: string,
): Promise<{ oldBalance: number; newBalance: number }> {
  const donorRes = await client.query(
    `SELECT account_balance, user_name, email FROM users WHERE id = $1 FOR UPDATE`,
    [donorUserId],
  );
  if (donorRes.rows.length === 0) throw new Error("Donor user not found.");

  const oldBalance = parseFloat(donorRes.rows[0].account_balance) || 0;
  if (oldBalance < capAmount) {
    throw new Error(
      `Donor balance (${oldBalance.toFixed(2)}) is insufficient for the requested cap (${capAmount.toFixed(2)}).`,
    );
  }
  const newBalance = parseFloat((oldBalance - capAmount).toFixed(2));

  await client.query(
    `UPDATE users SET account_balance = $1 WHERE id = $2`,
    [newBalance, donorUserId],
  );

  await client.query(
    `INSERT INTO account_balance_change_logs
       (user_id, payment_type, investment_name, old_value, user_name, new_value, change_date)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      donorUserId,
      "Match grant – funds reserved",
      grantName || "Match grant",
      oldBalance,
      donorRes.rows[0].user_name || donorRes.rows[0].email || "",
      newBalance,
    ],
  );

  return { oldBalance, newBalance };
}

// ------------------------------------------------------------------ //
// Shared helper: return unused reserved funds to donor wallet
// ------------------------------------------------------------------ //
async function returnUnusedFunds(
  client: any,
  donorUserId: string,
  reservedAmount: number,
  amountUsed: number,
  grantName: string,
): Promise<number> {
  const refund = Math.max(
    0,
    Math.round((reservedAmount - amountUsed) * 100) / 100,
  );
  if (refund <= 0) return 0;

  const donorRes = await client.query(
    `SELECT account_balance, user_name, email FROM users WHERE id = $1 FOR UPDATE`,
    [donorUserId],
  );
  if (donorRes.rows.length === 0) return 0;

  const oldBalance = parseFloat(donorRes.rows[0].account_balance) || 0;
  const newBalance = parseFloat((oldBalance + refund).toFixed(2));

  await client.query(
    `UPDATE users SET account_balance = $1 WHERE id = $2`,
    [newBalance, donorUserId],
  );

  await client.query(
    `INSERT INTO account_balance_change_logs
       (user_id, payment_type, investment_name, old_value, user_name, new_value, change_date)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      donorUserId,
      "Match grant – unused funds returned",
      grantName || "Match grant",
      oldBalance,
      donorRes.rows[0].user_name || donorRes.rows[0].email || "",
      newBalance,
    ],
  );

  return refund;
}

// ------------------------------------------------------------------ //
// GET /api/admin/matching
// ------------------------------------------------------------------ //
router.get("/", async (req: Request, res: Response) => {
  try {
    const grantsResult = await pool.query(
      `SELECT cmg.id,
              cmg.name,
              cmg.donor_user_id,
              u.email          AS donor_email,
              CONCAT(u.first_name, ' ', u.last_name) AS donor_full_name,
              u.user_name      AS donor_user_name,
              u.account_balance AS donor_balance,
              cmg.total_cap,
              cmg.amount_used,
              cmg.reserved_amount,
              cmg.match_type,
              cmg.per_investment_cap,
              cmg.is_active,
              cmg.notes,
              cmg.expires_at,
              cmg.created_at,
              cmg.updated_at,
              (SELECT COUNT(*) FROM campaign_match_grant_activity a
                WHERE a.match_grant_id = cmg.id) AS times_used
         FROM campaign_match_grants cmg
         LEFT JOIN users u ON u.id = cmg.donor_user_id
        ORDER BY cmg.created_at DESC`,
    );

    const grants = await Promise.all(
      grantsResult.rows.map(async (g: any) => {
        const campResult = await pool.query(
          `SELECT c.id, c.name
             FROM campaign_match_grant_campaigns cmgc
             JOIN campaigns c ON c.id = cmgc.campaign_id
            WHERE cmgc.match_grant_id = $1
            ORDER BY c.name`,
          [g.id],
        );
        return {
          id: g.id,
          name: g.name || "",
          donorUserId: g.donor_user_id,
          donorEmail: g.donor_email || "",
          donorFullName: (g.donor_full_name || "").trim() || g.donor_user_name || "",
          donorBalance: parseFloat(g.donor_balance) || 0,
          totalCap: g.total_cap != null ? parseFloat(g.total_cap) : null,
          amountUsed: parseFloat(g.amount_used) || 0,
          reservedAmount: parseFloat(g.reserved_amount) || 0,
          matchType: g.match_type || "full",
          perInvestmentCap: g.per_investment_cap != null ? parseFloat(g.per_investment_cap) : null,
          isActive: g.is_active,
          notes: g.notes || "",
          expiresAt: g.expires_at || null,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          timesUsed: parseInt(g.times_used) || 0,
          campaigns: campResult.rows.map((c: any) => ({ id: c.id, name: c.name })),
        };
      }),
    );

    res.json({ success: true, items: grants });
  } catch (err: any) {
    console.error("Error listing match grants:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------ //
// GET /api/admin/matching/:id/activity
// ------------------------------------------------------------------ //
router.get("/:id/activity", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    const result = await pool.query(
      `SELECT a.id, a.amount, a.created_at,
              c.name   AS campaign_name,
              CONCAT(iu.first_name, ' ', iu.last_name) AS investor_full_name,
              iu.email AS investor_email,
              a.triggered_by_recommendation_id,
              a.donor_recommendation_id
         FROM campaign_match_grant_activity a
         LEFT JOIN campaigns c ON c.id = a.campaign_id
         LEFT JOIN users iu ON iu.id = a.triggered_by_user_id
        WHERE a.match_grant_id = $1
        ORDER BY a.created_at DESC
        LIMIT 500`,
      [id],
    );
    res.json({
      success: true,
      items: result.rows.map((r: any) => ({
        id: r.id,
        amount: parseFloat(r.amount) || 0,
        createdAt: r.created_at,
        campaignName: r.campaign_name || "",
        investorFullName: (r.investor_full_name || "").trim(),
        investorEmail: r.investor_email || "",
        triggeringRecommendationId: r.triggered_by_recommendation_id,
        donorRecommendationId: r.donor_recommendation_id,
      })),
    });
  } catch (err: any) {
    console.error("Error fetching match grant activity:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------ //
// GET /api/admin/matching/donor-search?q=...
// ------------------------------------------------------------------ //
router.get("/donor-search", async (req: Request, res: Response) => {
  try {
    const q = (String(req.query.q || "")).trim();
    if (q.length < 2) {
      res.json({ success: true, items: [] });
      return;
    }
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, user_name, account_balance
         FROM users
        WHERE (is_deleted IS NULL OR is_deleted = false)
          AND (
               email ILIKE $1
            OR first_name ILIKE $1
            OR last_name ILIKE $1
            OR user_name ILIKE $1
            OR CONCAT(first_name, ' ', last_name) ILIKE $1
          )
        ORDER BY first_name, last_name
        LIMIT 20`,
      [`%${q}%`],
    );
    res.json({
      success: true,
      items: result.rows.map((u: any) => ({
        id: u.id,
        email: u.email,
        fullName: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.user_name || u.email,
        accountBalance: parseFloat(u.account_balance) || 0,
      })),
    });
  } catch (err: any) {
    console.error("Error searching donors:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------ //
// POST /api/admin/matching  — create grant + reserve funds
// ------------------------------------------------------------------ //
router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};

    if (!b.donorUserId) {
      res.status(400).json({ success: false, message: "donorUserId is required." });
      return;
    }
    if (!Array.isArray(b.campaignIds) || b.campaignIds.length === 0) {
      res.status(400).json({ success: false, message: "At least one campaign is required." });
      return;
    }

    const matchType: string = b.matchType === "capped" ? "capped" : "full";
    const totalCap =
      b.totalCap != null && b.totalCap !== "" ? parseFloat(String(b.totalCap)) : null;
    const perInvestmentCap =
      matchType === "capped" && b.perInvestmentCap != null && b.perInvestmentCap !== ""
        ? parseFloat(String(b.perInvestmentCap))
        : null;
    const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
    const grantName = (b.name || "").trim();

    await client.query("BEGIN");

    // Insert grant (reserved_amount will be updated below if cap is set)
    const grantResult = await client.query(
      `INSERT INTO campaign_match_grants
         (name, donor_user_id, total_cap, match_type, per_investment_cap,
          is_active, notes, expires_at, reserved_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)
       RETURNING id`,
      [
        grantName,
        b.donorUserId,
        totalCap,
        matchType,
        perInvestmentCap,
        b.isActive !== false,
        (b.notes || "").trim() || null,
        expiresAt,
      ],
    );
    const grantId = grantResult.rows[0].id;

    // Add campaign links
    const campaignIds: number[] = b.campaignIds
      .map((id: any) => parseInt(String(id), 10))
      .filter((n: number) => !isNaN(n));
    for (const campaignId of campaignIds) {
      await client.query(
        `INSERT INTO campaign_match_grant_campaigns (match_grant_id, campaign_id)
         VALUES ($1, $2)
         ON CONFLICT ON CONSTRAINT campaign_match_grant_campaigns_unique DO NOTHING`,
        [grantId, campaignId],
      );
    }

    // Reserve funds from donor wallet if a cap is set
    if (totalCap != null && totalCap > 0 && b.isActive !== false) {
      await reserveCapFromWallet(client, b.donorUserId, totalCap, grantName || `Grant #${grantId}`);
      await client.query(
        `UPDATE campaign_match_grants SET reserved_amount = $1 WHERE id = $2`,
        [totalCap, grantId],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Match grant created.", id: grantId });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error creating match grant:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------ //
// PUT /api/admin/matching/:id  — update grant, adjust reservation
// ------------------------------------------------------------------ //
router.put("/:id", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const b = req.body || {};
    const matchType: string = b.matchType === "capped" ? "capped" : "full";
    const newCap =
      b.totalCap != null && b.totalCap !== "" ? parseFloat(String(b.totalCap)) : null;
    const perInvestmentCap =
      matchType === "capped" && b.perInvestmentCap != null && b.perInvestmentCap !== ""
        ? parseFloat(String(b.perInvestmentCap))
        : null;
    const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
    const grantName = (b.name || "").trim();

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, donor_user_id, reserved_amount, amount_used, name, total_cap
         FROM campaign_match_grants WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Match grant not found." });
      return;
    }

    const g = existing.rows[0];
    const oldReserved = parseFloat(g.reserved_amount) || 0;
    const amountUsed = parseFloat(g.amount_used) || 0;
    const newCapVal = newCap ?? 0;

    // Validate new cap doesn't go below what's already matched
    if (newCap != null && newCap < amountUsed) {
      await client.query("ROLLBACK");
      res.status(400).json({
        success: false,
        message: `Cap cannot be set below amount already matched ($${amountUsed.toFixed(2)}).`,
      });
      return;
    }

    // Adjust reservation if cap changed
    if (newCapVal !== oldReserved) {
      // Return old unused first
      if (oldReserved > 0) {
        await returnUnusedFunds(
          client,
          g.donor_user_id,
          oldReserved,
          amountUsed,
          grantName || g.name || `Grant #${id}`,
        );
      }
      // Reserve new amount if cap is set and grant is active
      if (newCap != null && newCap > 0 && b.isActive !== false) {
        await reserveCapFromWallet(
          client,
          b.donorUserId || g.donor_user_id,
          newCap,
          grantName || g.name || `Grant #${id}`,
        );
      }
    }

    await client.query(
      `UPDATE campaign_match_grants
          SET name               = $1,
              donor_user_id      = $2,
              total_cap          = $3,
              match_type         = $4,
              per_investment_cap = $5,
              is_active          = $6,
              notes              = $7,
              expires_at         = $8,
              reserved_amount    = $9,
              updated_at         = NOW()
        WHERE id = $10`,
      [
        grantName,
        b.donorUserId || g.donor_user_id,
        newCap,
        matchType,
        perInvestmentCap,
        b.isActive !== false,
        (b.notes || "").trim() || null,
        expiresAt,
        newCap != null && newCap > 0 && b.isActive !== false ? newCap : 0,
        id,
      ],
    );

    // Replace campaign list
    if (Array.isArray(b.campaignIds)) {
      await client.query(
        `DELETE FROM campaign_match_grant_campaigns WHERE match_grant_id = $1`,
        [id],
      );
      const campaignIds: number[] = b.campaignIds
        .map((cid: any) => parseInt(String(cid), 10))
        .filter((n: number) => !isNaN(n));
      for (const campaignId of campaignIds) {
        await client.query(
          `INSERT INTO campaign_match_grant_campaigns (match_grant_id, campaign_id)
           VALUES ($1, $2)
           ON CONFLICT ON CONSTRAINT campaign_match_grant_campaigns_unique DO NOTHING`,
          [id, campaignId],
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Match grant updated." });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating match grant:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------ //
// DELETE /api/admin/matching/:id  — return unused funds then delete
// ------------------------------------------------------------------ //
router.delete("/:id", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, donor_user_id, reserved_amount, amount_used, name
         FROM campaign_match_grants WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Match grant not found." });
      return;
    }

    const g = existing.rows[0];
    const reserved = parseFloat(g.reserved_amount) || 0;
    const used = parseFloat(g.amount_used) || 0;

    // Return unused reserved funds to donor
    const refunded = await returnUnusedFunds(
      client,
      g.donor_user_id,
      reserved,
      used,
      g.name || `Grant #${id}`,
    );

    await client.query(`DELETE FROM campaign_match_grants WHERE id = $1`, [id]);

    await client.query("COMMIT");
    res.json({
      success: true,
      message: "Match grant deleted." + (refunded > 0 ? ` $${refunded.toFixed(2)} returned to donor.` : ""),
    });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error deleting match grant:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

export default router;
