import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

router.get("/get-account-history", async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const isAsc = (query.SortDirection || query.sortDirection || "").toLowerCase() === "asc";
    const sortField = (query.SortField || query.sortField || "").toLowerCase();
    const rawPage = parseInt(query.CurrentPage || query.currentPage || "1", 10);
    const rawPageSize = parseInt(query.PerPage || query.perPage || "50", 10);
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const pageSize = Math.min(500, Math.max(1, isNaN(rawPageSize) ? 50 : rawPageSize));
    const searchValue = query.SearchValue || query.searchValue;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [
      "(a.is_deleted IS NULL OR a.is_deleted = false)",
    ];
    const values: (string | number)[] = [];
    let paramIdx = 1;

    if (searchValue && searchValue.trim()) {
      const search = `%${searchValue.trim().toLowerCase()}%`;
      conditions.push(
        `(LOWER(a.user_name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx} OR LOWER(a.payment_type) LIKE $${paramIdx} OR LOWER(a.investment_name) LIKE $${paramIdx})`
      );
      values.push(search);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    let orderBy: string;
    switch (sortField) {
      case "changedate":
        orderBy = `a.change_date ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "investmentname":
        orderBy = `a.investment_name ${isAsc ? "ASC" : "DESC"}`;
        break;
      default:
        orderBy = "a.change_date DESC";
        break;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM account_balance_change_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE ${whereClause}`,
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
         a.comment
       FROM account_balance_change_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, pageSize, offset]
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
    }));

    res.json({ items, totalCount });
  } catch (err) {
    console.error("Account history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/getAll/:groupId", async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (isNaN(groupId)) {
      res.status(400).json({ message: "Invalid group ID" });
      return;
    }

    const sortField = (
      (req.query.sortField as string) ||
      (req.query.SortField as string) ||
      ""
    ).toLowerCase();
    const sortDirection = (
      (req.query.sortDirection as string) ||
      (req.query.SortDirection as string) ||
      ""
    ).toLowerCase();
    const isAsc = sortDirection === "asc";

    let orderBy: string;
    switch (sortField) {
      case "changedate":
        orderBy = `a.change_date ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "investmentname":
        orderBy = `a.investment_name ${isAsc ? "ASC" : "DESC"}`;
        break;
      default:
        orderBy = "a.change_date DESC";
        break;
    }

    const result = await pool.query(
      `SELECT
         a.id,
         a.user_name AS "userName",
         a.change_date AS "changeDate",
         a.old_value AS "oldValue",
         a.new_value AS "newValue",
         a.investment_name AS "investmentName"
       FROM account_balance_change_logs a
       WHERE a.group_id = $1
         AND (a.is_deleted IS NULL OR a.is_deleted = false)
       ORDER BY ${orderBy}`,
      [groupId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Group account history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/Export", async (req: Request, res: Response) => {
  try {
    const groupId = req.query.groupId
      ? parseInt(req.query.groupId as string, 10)
      : null;

    const conditions: string[] = [
      "(a.is_deleted IS NULL OR a.is_deleted = false)",
    ];
    const values: number[] = [];

    if (groupId !== null && !isNaN(groupId)) {
      conditions.push("a.group_id = $1");
      values.push(groupId);
    }

    const whereClause = conditions.join(" AND ");

    const result = await pool.query(
      `SELECT
         a.user_name,
         a.change_date,
         a.investment_name,
         a.payment_type,
         a.old_value,
         a.new_value,
         a.zip_code,
         a.comment
       FROM account_balance_change_logs a
       WHERE ${whereClause}
       ORDER BY a.id DESC`,
      values
    );

    const headers = [
      "UserName",
      "ChangeDate",
      "InvestmentName",
      "PaymentType",
      "OldValue",
      "NewValue",
      "ZipCode",
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
    console.error("Export account history error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
