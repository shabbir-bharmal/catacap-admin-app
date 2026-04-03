import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const tables = [
      { key: "accountBalanceLogs", table: "account_balance_change_logs" },
      { key: "approvedBy", table: "approvers" },
      { key: "assetRequests", table: "asset_based_payment_requests" },
      { key: "campaigns", table: "campaigns" },
      { key: "teams", table: "catacap_teams" },
      { key: "completedInvestments", table: "completed_investment_details" },
      { key: "disbursals", table: "disbursal_requests" },
      { key: "emailTemplates", table: "email_templates" },
      { key: "events", table: "events" },
      { key: "faqs", table: "faqs" },
      { key: "formSubmissions", table: "form_submissions" },
      { key: "groups", table: "groups" },
      { key: "investmentTags", table: "investment_tags" },
      { key: "news", table: "news" },
      { key: "pendingGrants", table: "pending_grants" },
      { key: "recommendations", table: "recommendations" },
      { key: "returnDetails", table: "return_details" },
      { key: "testimonials", table: "testimonials" },
      { key: "themes", table: "themes" },
      { key: "users", table: "users" },
    ];

    const countQueries = tables.map((t) =>
      pool.query(`SELECT COUNT(*) as cnt FROM ${t.table} WHERE is_deleted = true`)
    );

    const results = await Promise.all(countQueries);

    const summary: Record<string, number> = {};
    let totalDeleted = 0;

    tables.forEach((t, i) => {
      const count = parseInt(results[i].rows[0].cnt, 10);
      summary[t.key] = count;
      totalDeleted += count;
    });

    summary.totalDeleted = totalDeleted;

    res.json({ success: true, data: summary });
  } catch (err) {
    console.error("Get recycle bin summary error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
