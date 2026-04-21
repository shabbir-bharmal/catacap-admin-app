import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, handleMissingTableError } from "../utils/softDelete.js";
import { restoreUsersWithCascadeInTx, findDeletedParentUserIdsByFk } from "../utils/userRestore.js";
import { sendTemplateEmail } from "../utils/emailService.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

const router = Router();

function formatDateShort(dateVal: any): string {
  if (!dateVal) return "";
  const d = dayjs.utc(dateVal);
  if (!d.isValid()) return "";
  return d.format("MM/DD/YY");
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const investmentIdRaw = req.query.InvestmentId || req.query.investmentId;
    const investmentId = investmentIdRaw ? parseInt(String(investmentIdRaw), 10) : 0;

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.isDeleted === true) {
      conditions.push(`rd.is_deleted = true`);
    } else {
      conditions.push(`(rd.is_deleted IS NULL OR rd.is_deleted = false)`);
    }

    if (investmentId > 0) {
      values.push(investmentId);
      conditions.push(`rm.campaign_id = $${values.length}`);
    }

    // Drive the query from return_details so every soft-deleted detail is counted,
    // even if its parent return_master row was hard-deleted. The joins are LEFT
    // joins for the same reason (orphaned details are still surfaced).
    const queryText = `
      SELECT rm.id AS master_id, rm.campaign_id, rm.created_on, rm.memo_note, rm.status,
             rm.private_debt_start_date, rm.private_debt_end_date, rm.post_date,
             c.name AS campaign_name,
             rd.id AS detail_id, rd.user_id, rd.investment_amount, rd.percentage_of_total_investment,
             rd.return_amount AS detail_return_amount, rd.is_deleted, rd.deleted_at,
             u.first_name, u.last_name, u.email,
             du.first_name AS deleted_by_first_name, du.last_name AS deleted_by_last_name
      FROM return_details rd
      LEFT JOIN return_masters rm ON rd.return_master_id = rm.id
      LEFT JOIN campaigns c ON rm.campaign_id = c.id
      LEFT JOIN users u ON rd.user_id = u.id AND (u.is_deleted IS NULL OR u.is_deleted = false)
      LEFT JOIN users du ON du.id = rd.deleted_by
      WHERE ${conditions.join(" AND ")}
    `;

    const result = await pool.query(queryText, values);

    if (result.rows.length === 0) {
      res.json({ success: false, message: "No data found." });
      return;
    }

    let rows = result.rows;

    rows.sort((a: any, b: any) => {
      const dateA = new Date(a.created_on || 0).getTime();
      const dateB = new Date(b.created_on || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const amtA = parseFloat(a.investment_amount) || 0;
      const amtB = parseFloat(b.investment_amount) || 0;
      return amtB - amtA;
    });

    const mapped = rows.map((r: any) => {
      let privateDebtDates: string | null = null;
      if (r.private_debt_start_date && r.private_debt_end_date) {
        privateDebtDates = `${formatDateShort(r.private_debt_start_date)}-${formatDateShort(r.private_debt_end_date)}`;
      }

      return {
        id: Number(r.detail_id),
        investmentName: r.campaign_name,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        investmentAmount: parseFloat(r.investment_amount) || 0,
        percentage: parseFloat(r.percentage_of_total_investment) || 0,
        returnedAmount: parseFloat(r.detail_return_amount) || 0,
        memo: r.memo_note,
        status: r.status,
        privateDebtDates,
        postDate: formatDateShort(r.post_date || r.created_on),
        deletedAt: r.deleted_at,
        deletedBy: r.deleted_by_first_name
          ? `${r.deleted_by_first_name} ${r.deleted_by_last_name || ""}`.trim()
          : null,
      };
    });

    const totalCount = mapped.length;

    if (totalCount === 0) {
      res.json({ success: false, message: "No data found." });
      return;
    }

    const page = params.currentPage;
    const pageSize = params.perPage;
    const items = mapped.slice((page - 1) * pageSize, page * pageSize);

    res.json({ items, totalCount });
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("Error fetching investment returns:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/calculate", async (req: Request, res: Response) => {
  try {
    const investmentId = parseInt(String(req.query.InvestmentId || req.query.investmentId || "0"), 10);
    const returnAmount = parseFloat(String(req.query.ReturnAmount || req.query.returnAmount || "0"));
    const currentPageRaw = req.query.CurrentPage || req.query.currentPage;
    const perPageRaw = req.query.PerPage || req.query.perPage;

    if (investmentId <= 0) {
      res.json({ success: false, message: "InvestmentId is required." });
      return;
    }
    if (returnAmount <= 0) {
      res.json({ success: false, message: "Return amount must be greater than zero." });
      return;
    }

    const campaignResult = await pool.query(`SELECT name FROM campaigns WHERE id = $1`, [investmentId]);
    const campaignName = campaignResult.rows[0]?.name || null;

    const activeUsersResult = await pool.query(`SELECT email FROM users WHERE is_active = true AND (is_deleted IS NULL OR is_deleted = false)`);
    const activeEmails = activeUsersResult.rows.map((r: any) => r.email);

    if (activeEmails.length === 0) {
      res.json({ success: false, message: "No records found for the selected investment." });
      return;
    }

    const emailPlaceholders = activeEmails.map((_: any, i: number) => `$${i + 2}`).join(", ");
    const recResult = await pool.query(
      `SELECT r.user_email, r.amount
       FROM recommendations r
       JOIN campaigns c ON r.campaign_id = c.id
       WHERE c.id = $1
         AND LOWER(r.status) = 'approved'
         AND LOWER(r.user_email) IN (${emailPlaceholders})`,
      [investmentId, ...activeEmails.map((e: string) => e.toLowerCase())]
    );

    const recommendations = recResult.rows;
    if (recommendations.length === 0) {
      res.json({ success: false, message: "No records found for the selected investment." });
      return;
    }

    const totalInvestment = recommendations.reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0);

    if (totalInvestment === 0) {
      res.json({ success: false, message: "No records found for the selected investment." });
      return;
    }

    const userEmails = recommendations.map((r: any) => r.user_email);
    const userPlaceholders = userEmails.map((_: any, i: number) => `$${i + 1}`).join(", ");
    const usersResult = await pool.query(
      `SELECT first_name, last_name, email FROM users WHERE LOWER(email) IN (${userPlaceholders}) AND (is_deleted IS NULL OR is_deleted = false)`,
      userEmails.map((e: string) => e?.toLowerCase())
    );
    const userMap: Record<string, any> = {};
    for (const u of usersResult.rows) {
      userMap[u.email?.toLowerCase()] = u;
    }

    let results = recommendations.map((r: any) => {
      const amount = parseFloat(r.amount) || 0;
      const userPercentage = amount / totalInvestment;
      const user = userMap[r.user_email?.toLowerCase()] || {};
      return {
        investmentName: campaignName,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        email: r.user_email,
        investmentAmount: amount,
        percentage: Math.round(userPercentage * 100 * 100) / 100,
        returnedAmount: Math.round(userPercentage * returnAmount * 100) / 100,
      };
    });

    results.sort((a: any, b: any) => b.investmentAmount - a.investmentAmount);

    const totalCount = results.length;

    if (currentPageRaw && perPageRaw) {
      const currentPage = parseInt(String(currentPageRaw), 10) || 1;
      const perPage = parseInt(String(perPageRaw), 10) || 10;
      results = results.slice((currentPage - 1) * perPage, currentPage * perPage);
    }

    res.json({ items: results, totalCount, investmentName: campaignName, investmentId });
  } catch (err: any) {
    console.error("Error calculating investment returns:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const { investmentId, returnAmount, memoNote, privateDebtStartDate, privateDebtEndDate } = req.body;

    if (!investmentId || investmentId <= 0) {
      res.json({ success: false, message: "InvestmentId is required." });
      return;
    }
    if (!returnAmount || returnAmount <= 0) {
      res.json({ success: false, message: "Return amount must be greater than zero." });
      return;
    }
    if (!memoNote) {
      res.json({ success: false, message: "Admin memo is required." });
      return;
    }

    const loginUserId = req.user?.id;

    const activeUsersResult = await pool.query(`SELECT email FROM users WHERE is_active = true AND (is_deleted IS NULL OR is_deleted = false)`);
    const activeEmails = activeUsersResult.rows.map((r: any) => r.email);

    if (activeEmails.length === 0) {
      res.json({ success: false, message: "Failed to calculate returns." });
      return;
    }

    const emailPlaceholders = activeEmails.map((_: any, i: number) => `$${i + 2}`).join(", ");
    const recResult = await pool.query(
      `SELECT r.user_email, r.amount
       FROM recommendations r
       JOIN campaigns c ON r.campaign_id = c.id
       WHERE c.id = $1
         AND LOWER(r.status) = 'approved'
         AND LOWER(r.user_email) IN (${emailPlaceholders})`,
      [investmentId, ...activeEmails.map((e: string) => e.toLowerCase())]
    );

    const recommendations = recResult.rows;
    if (recommendations.length === 0) {
      res.json({ success: false, message: "Failed to calculate returns." });
      return;
    }

    const totalInvestment = recommendations.reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0);
    if (totalInvestment === 0) {
      res.json({ success: false, message: "Failed to calculate returns." });
      return;
    }

    const userEmails = recommendations.map((r: any) => r.user_email);
    const userPlaceholders = userEmails.map((_: any, i: number) => `$${i + 1}`).join(", ");
    const usersResult = await pool.query(
      `SELECT id, first_name, last_name, email, user_name, account_balance FROM users WHERE LOWER(email) IN (${userPlaceholders}) AND (is_deleted IS NULL OR is_deleted = false)`,
      userEmails.map((e: string) => e?.toLowerCase())
    );
    const userMap: Record<string, any> = {};
    for (const u of usersResult.rows) {
      userMap[u.email?.toLowerCase()] = u;
    }

    const campaignResult = await pool.query(`SELECT id, name FROM campaigns WHERE id = $1`, [investmentId]);
    const campaign = campaignResult.rows[0];

    const items = recommendations.map((r: any) => {
      const amount = parseFloat(r.amount) || 0;
      const userPercentage = amount / totalInvestment;
      const user = userMap[r.user_email?.toLowerCase()] || {};
      return {
        investmentName: campaign?.name,
        firstName: user.first_name,
        lastName: user.last_name,
        email: r.user_email,
        investmentAmount: amount,
        percentage: Math.round(userPercentage * 100 * 100) / 100,
        returnedAmount: Math.round(userPercentage * returnAmount * 100) / 100,
      };
    });

    const totalInvestors = items.length;
    const totalInvestmentAmount = items.reduce((sum: number, item: any) => sum + item.investmentAmount, 0);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const masterResult = await client.query(
        `INSERT INTO return_masters (campaign_id, created_by, return_amount, total_investors, total_investment_amount, memo_note, status, private_debt_start_date, private_debt_end_date, post_date, created_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id`,
        [
          investmentId,
          loginUserId,
          returnAmount,
          totalInvestors,
          totalInvestmentAmount,
          memoNote || null,
          "Accepted",
          privateDebtStartDate || null,
          privateDebtEndDate || null,
        ]
      );

      const returnMasterId = masterResult.rows[0].id;

      for (const item of items) {
        const user = userMap[item.email?.toLowerCase()];
        if (!user) continue;

        await client.query(
          `INSERT INTO return_details (return_master_id, user_id, investment_amount, percentage_of_total_investment, return_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [returnMasterId, user.id, item.investmentAmount, item.percentage, item.returnedAmount]
        );

        const oldBalance = parseFloat(user.account_balance) || 0;
        const newBalance = oldBalance + item.returnedAmount;

        await client.query(
          `INSERT INTO account_balance_change_logs (user_id, payment_type, old_value, user_name, new_value, change_date, investment_name, campaign_id, fees, gross_amount, net_amount)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 0, $8, $9)`,
          [
            user.id,
            `Return credited, Id = ${returnMasterId}`,
            oldBalance,
            user.user_name,
            newBalance,
            campaign?.name || "",
            investmentId,
            item.returnedAmount,
            item.returnedAmount,
          ]
        );

        await client.query(`UPDATE users SET account_balance = $1 WHERE id = $2`, [newBalance, user.id]);
      }

      await client.query("COMMIT");

      for (const item of items) {
        const user = userMap[item.email?.toLowerCase()];
        if (!user) continue;

        const formattedAmount = `$${item.returnedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const logoUrl = process.env.LOGO_URL || "";
        const requestOrigin = process.env.REQUEST_ORIGIN || process.env.VITE_FRONTEND_URL || "";

        const variables: Record<string, string> = {
          logoUrl,
          firstName: user.first_name || "",
          lastName: user.last_name || "",
          investmentName: item.investmentName || "",
          returnedAmount: formattedAmount,
          unsubscribeUrl: `${requestOrigin}/settings`,
        };

        sendTemplateEmail(13, user.email, variables).catch((emailErr) => {
          console.error(`[EMAIL] Failed to send return notification to ${user.email}:`, emailErr);
        });
      }

      res.json({ success: true, message: "Returns submitted successfully." });
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Error saving investment returns:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT rm.created_on, rm.memo_note, rm.status,
             rm.private_debt_start_date, rm.private_debt_end_date, rm.post_date,
             c.name AS campaign_name,
             rd.investment_amount, rd.percentage_of_total_investment, rd.return_amount AS detail_return_amount,
             u.first_name, u.last_name, u.email
      FROM return_masters rm
      LEFT JOIN campaigns c ON rm.campaign_id = c.id
      LEFT JOIN return_details rd ON rd.return_master_id = rm.id
      LEFT JOIN users u ON rd.user_id = u.id AND (u.is_deleted IS NULL OR u.is_deleted = false)
      WHERE rd.id IS NOT NULL
      ORDER BY rm.created_on DESC, rd.investment_amount DESC
    `);

    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Returns");

    const headers = [
      "Investment Name", "Date Range", "Post Date", "First Name", "Last Name", "Email",
      "Investment Amount", "Percentage", "Returned Amount", "Memo", "Status",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const row of rows) {
      let privateDebtDates = "";
      if (row.private_debt_start_date && row.private_debt_end_date) {
        privateDebtDates = `${formatDateShort(row.private_debt_start_date)}-${formatDateShort(row.private_debt_end_date)}`;
      }

      const percentage = parseFloat(row.percentage_of_total_investment) || 0;

      worksheet.addRow([
        row.campaign_name || "",
        privateDebtDates,
        formatDateShort(row.post_date),
        row.first_name || "",
        row.last_name || "",
        row.email || "",
        parseFloat(row.investment_amount) || 0,
        percentage / 100,
        parseFloat(row.detail_return_amount) || 0,
        row.memo_note || "",
        row.status || "",
      ]);
    }

    const percentageCol = 8;
    worksheet.getColumn(percentageCol).numFmt = "0.00%";
    worksheet.getColumn(7).numFmt = "$#,##0.00";
    worksheet.getColumn(9).numFmt = "$#,##0.00";

    const rightAlignCols = [7, 8, 9];
    for (const colIdx of rightAlignCols) {
      worksheet.getColumn(colIdx).alignment = { horizontal: "right" };
    }

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 10;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Returns.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting investment returns:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const loginUserId = req.user?.id;

    const check = await pool.query(
      `SELECT id FROM return_details WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (check.rows.length === 0) {
      res.json({ success: false, message: "Return not found." });
      return;
    }

    await pool.query(
      `UPDATE return_details SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [loginUserId, id]
    );

    res.json({ success: true, message: "Return deleted successfully." });
  } catch (err: any) {
    console.error("Error deleting investment return:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/restore", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const ids: number[] = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.json({ success: false, message: "No IDs provided." });
      return;
    }

    let restoredCount = 0;
    let restoredUserCount = 0;
    try {
      await client.query("BEGIN");

      const parentUserIds = await findDeletedParentUserIdsByFk(
        client,
        "return_details",
        "id",
        "user_id",
        ids
      );
      if (parentUserIds.length > 0) {
        const restoredUsers = await restoreUsersWithCascadeInTx(client, parentUserIds);
        restoredUserCount = restoredUsers.length;
      }

      const result = await client.query(
        `UPDATE return_details SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE id = ANY($1) AND is_deleted = true
         RETURNING id`,
        [ids]
      );
      restoredCount = result.rowCount ?? 0;

      if (restoredCount === 0 && restoredUserCount === 0) {
        await client.query("ROLLBACK");
        res.json({ success: false, message: "No deleted returns found to restore." });
        return;
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    }

    res.json({
      success: true,
      message: `${restoredCount} return(s) restored successfully.`,
      restoredCount,
      restoredUserCount,
    });
  } catch (err: any) {
    console.error("Error restoring investment returns:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

export default router;
