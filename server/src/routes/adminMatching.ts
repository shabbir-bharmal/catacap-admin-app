import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

// ------------------------------------------------------------------ //
// GET /api/admin/matching
// List all match grants with donor info, campaign list, and utilization
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
              cmg.match_type,
              cmg.per_investment_cap,
              cmg.is_active,
              cmg.notes,
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
          matchType: g.match_type || "full",
          perInvestmentCap: g.per_investment_cap != null ? parseFloat(g.per_investment_cap) : null,
          isActive: g.is_active,
          notes: g.notes || "",
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          timesUsed: parseInt(g.times_used) || 0,
          campaigns: campResult.rows.map((c: any) => ({
            id: c.id,
            name: c.name,
          })),
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
// Activity log for a specific match grant
// ------------------------------------------------------------------ //
router.get("/:id/activity", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }

    const result = await pool.query(
      `SELECT a.id,
              a.amount,
              a.created_at,
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
// POST /api/admin/matching
// Create a new match grant
// ------------------------------------------------------------------ //
router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};

    // Validate required
    if (!b.donorUserId) {
      res.status(400).json({ success: false, message: "donorUserId is required." });
      return;
    }
    if (!Array.isArray(b.campaignIds) || b.campaignIds.length === 0) {
      res.status(400).json({ success: false, message: "At least one campaign is required." });
      return;
    }

    const matchType: string = b.matchType === "capped" ? "capped" : "full";
    const totalCap = b.totalCap != null && b.totalCap !== "" ? parseFloat(String(b.totalCap)) : null;
    const perInvestmentCap =
      matchType === "capped" && b.perInvestmentCap != null && b.perInvestmentCap !== ""
        ? parseFloat(String(b.perInvestmentCap))
        : null;

    await client.query("BEGIN");

    const grantResult = await client.query(
      `INSERT INTO campaign_match_grants
         (name, donor_user_id, total_cap, match_type, per_investment_cap, is_active, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        (b.name || "").trim(),
        b.donorUserId,
        totalCap,
        matchType,
        perInvestmentCap,
        b.isActive !== false,
        (b.notes || "").trim() || null,
      ],
    );
    const grantId = grantResult.rows[0].id;

    const campaignIds: number[] = b.campaignIds.map((id: any) => parseInt(String(id), 10)).filter((n: number) => !isNaN(n));
    for (const campaignId of campaignIds) {
      await client.query(
        `INSERT INTO campaign_match_grant_campaigns (match_grant_id, campaign_id)
         VALUES ($1, $2)
         ON CONFLICT ON CONSTRAINT campaign_match_grant_campaigns_unique DO NOTHING`,
        [grantId, campaignId],
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
// PUT /api/admin/matching/:id
// Update a match grant (replaces campaign list)
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
    const totalCap = b.totalCap != null && b.totalCap !== "" ? parseFloat(String(b.totalCap)) : null;
    const perInvestmentCap =
      matchType === "capped" && b.perInvestmentCap != null && b.perInvestmentCap !== ""
        ? parseFloat(String(b.perInvestmentCap))
        : null;

    await client.query("BEGIN");

    const existing = await client.query(`SELECT id FROM campaign_match_grants WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Match grant not found." });
      return;
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
              updated_at         = NOW()
        WHERE id = $8`,
      [
        (b.name || "").trim(),
        b.donorUserId,
        totalCap,
        matchType,
        perInvestmentCap,
        b.isActive !== false,
        (b.notes || "").trim() || null,
        id,
      ],
    );

    // Replace campaign list
    if (Array.isArray(b.campaignIds)) {
      await client.query(`DELETE FROM campaign_match_grant_campaigns WHERE match_grant_id = $1`, [id]);
      const campaignIds: number[] = b.campaignIds.map((cid: any) => parseInt(String(cid), 10)).filter((n: number) => !isNaN(n));
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
// DELETE /api/admin/matching/:id
// ------------------------------------------------------------------ //
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, message: "Invalid id" });
      return;
    }
    const result = await pool.query(`DELETE FROM campaign_match_grants WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Match grant not found." });
      return;
    }
    res.json({ success: true, message: "Match grant deleted." });
  } catch (err: any) {
    console.error("Error deleting match grant:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------------ //
// GET /api/admin/matching/donor-search?q=...
// Search users to pick as donor
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

export default router;
