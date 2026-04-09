import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

async function safeCount(tableName: string): Promise<number> {
  try {
    const tableCheck = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [tableName]
    );
    if (tableCheck.rows.length === 0) return 0;

    const colCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'is_deleted'`,
      [tableName]
    );
    if (colCheck.rows.length === 0) return 0;

    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM ${tableName} WHERE is_deleted = true`
    );
    return parseInt(result.rows[0].cnt, 10);
  } catch {
    return 0;
  }
}

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

    const countResults = await Promise.all(
      tables.map((t) => safeCount(t.table))
    );

    const summary: Record<string, number> = {};
    let totalDeleted = 0;

    tables.forEach((t, i) => {
      summary[t.key] = countResults[i];
      totalDeleted += countResults[i];
    });

    summary.totalDeleted = totalDeleted;

    res.json({ success: true, data: summary });
  } catch (err) {
    console.error("Get recycle bin summary error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
