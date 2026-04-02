import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, buildSortClause } from "../utils/softDelete.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("a", params.isDeleted, conditions);

    if (params.searchValue) {
      const searchParam = `%${params.searchValue.toLowerCase()}%`;
      conditions.push(
        `(LOWER(a.user_name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx} OR LOWER(a.payment_type) LIKE $${paramIdx} OR LOWER(a.investment_name) LIKE $${paramIdx})`
      );
      values.push(searchParam);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortColumns: Record<string, string> = {
      changedate: "a.change_date",
      investmentname: "a.investment_name",
    };
    const hasExplicitSort = params.sortField && sortColumns[params.sortField.toLowerCase()];
    const orderClause = hasExplicitSort
      ? buildSortClause(params.sortField, isAsc, sortColumns, "a.change_date")
      : "a.change_date DESC";

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM account_balance_change_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}`,
      values
    );
    const totalCount = parseInt(countResult.rows[0].total) || 0;

    if (totalCount === 0) {
      res.json({ success: false, message: "Data not found." });
      return;
    }

    const dataResult = await pool.query(
      `SELECT
         a.id,
         a.user_name AS "userName",
         u.email,
         a.change_date AS "changeDate",
         a.old_value AS "oldValue",
         a.new_value AS "newValue",
         a.payment_type AS "paymentType",
         a.investment_name AS "investmentName",
         a.comment,
         a.fees,
         a.net_amount AS "netAmount",
         a.gross_amount AS "grossAmount",
         a.deleted_at AS "deletedAt",
         CASE WHEN a.deleted_by IS NOT NULL
           THEN (SELECT COALESCE(du.first_name || ' ' || du.last_name, '') FROM users du WHERE du.id = a.deleted_by)
           ELSE NULL
         END AS "deletedBy"
       FROM account_balance_change_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((row) => ({
      id: row.id,
      userName: row.userName,
      email: row.email,
      changeDate: row.changeDate,
      oldValue: row.oldValue !== null ? parseFloat(row.oldValue) : null,
      newValue: row.newValue !== null ? parseFloat(row.newValue) : null,
      paymentType: row.paymentType,
      investmentName: row.investmentName,
      comment: row.comment,
      grossAmount: parseFloat(row.grossAmount) || 0,
      fees: parseFloat(row.fees) || 0,
      netAmount: parseFloat(row.netAmount) || 0,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    }));

    res.json({ items, totalCount });
  } catch (err) {
    console.error("Transaction history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.json({ success: false, message: "Invalid ID." });
      return;
    }

    const entity = await pool.query(
      `SELECT id FROM account_balance_change_logs WHERE id = $1`,
      [id]
    );

    if (entity.rows.length === 0) {
      res.json({ success: false, message: "Account history not found." });
      return;
    }

    const adminUser = (req as any).user;
    const deletedBy = adminUser ? `${adminUser.name || adminUser.email || "admin"}` : "admin";

    await pool.query(
      `UPDATE account_balance_change_logs
       SET is_deleted = true, deleted_at = NOW(), deleted_by = $2
       WHERE id = $1`,
      [id, deletedBy]
    );

    res.json({ success: true, message: "Account history deleted successfully." });
  } catch (err) {
    console.error("Delete transaction history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/restore", async (req: Request, res: Response) => {
  try {
    const ids: number[] = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.json({ success: false, message: "No IDs provided." });
      return;
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const logs = await pool.query(
      `SELECT id, is_deleted FROM account_balance_change_logs WHERE id IN (${placeholders})`,
      ids
    );

    if (logs.rows.length === 0) {
      res.json({ success: false, message: "Account history not found." });
      return;
    }

    const deletedIds = logs.rows
      .filter((r) => r.is_deleted === true)
      .map((r) => r.id);

    if (deletedIds.length === 0) {
      res.json({ success: false, message: "No deleted account history found." });
      return;
    }

    const restorePlaceholders = deletedIds.map((_, i) => `$${i + 1}`).join(", ");
    await pool.query(
      `UPDATE account_balance_change_logs
       SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id IN (${restorePlaceholders})`,
      deletedIds
    );

    res.json({
      success: true,
      message: `${deletedIds.length} account history record(s) restored successfully.`,
    });
  } catch (err) {
    console.error("Restore transaction history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         a.user_name,
         a.change_date,
         a.investment_name,
         a.payment_type,
         a.old_value,
         a.new_value,
         a.gross_amount,
         a.fees,
         a.net_amount,
         a.zip_code,
         a.comment
       FROM account_balance_change_logs a
       WHERE (a.is_deleted IS NULL OR a.is_deleted = false)
       ORDER BY a.id DESC`
    );

    const headers = [
      "User Name",
      "Change Date",
      "Investment Name",
      "Payment Type",
      "Old Value",
      "New Value",
      "Gross Amount",
      "Fees",
      "Net Amount",
      "Zip Code",
      "Comment",
    ];

    let csv = headers.join(",") + "\n";

    for (const row of result.rows) {
      const changeDate = row.change_date
        ? new Date(row.change_date).toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          })
        : "";

      const fields = [
        `"${(row.user_name || "").replace(/"/g, '""')}"`,
        `"${changeDate}"`,
        `"${(row.investment_name || "").replace(/"/g, '""')}"`,
        `"${(row.payment_type || "").replace(/"/g, '""')}"`,
        row.old_value !== null ? parseFloat(row.old_value).toFixed(2) : "0.00",
        row.new_value !== null ? parseFloat(row.new_value).toFixed(2) : "0.00",
        parseFloat(row.gross_amount || 0).toFixed(2),
        parseFloat(row.fees || 0).toFixed(2),
        parseFloat(row.net_amount || 0).toFixed(2),
        `"${(row.zip_code || "").replace(/"/g, '""')}"`,
        `"${(row.comment || "").replace(/"/g, '""')}"`,
      ];

      csv += fields.join(",") + "\n";
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="AccountBalanceHistory.csv"'
    );
    res.send(csv);
  } catch (err) {
    console.error("Export transaction history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
