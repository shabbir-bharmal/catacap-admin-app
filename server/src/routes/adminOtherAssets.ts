import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, handleMissingTableError } from "../utils/softDelete.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const page = params.currentPage;
    const pageSize = params.perPage;

    const statusList = params.status
      ? params.status.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    softDeleteFilter("abpr", params.isDeleted, conditions);

    if (statusList && statusList.length > 0) {
      if (statusList.includes("pending")) {
        const otherStatuses = statusList.filter((s) => s !== "pending");
        if (otherStatuses.length > 0) {
          conditions.push(`(abpr.status IS NULL OR abpr.status = '' OR LOWER(abpr.status) = ANY($${paramIdx}))`);
          values.push(statusList);
          paramIdx++;
        } else {
          conditions.push(`(abpr.status IS NULL OR abpr.status = '' OR LOWER(abpr.status) = 'pending')`);
        }
      } else {
        conditions.push(`abpr.status IS NOT NULL AND abpr.status != '' AND LOWER(abpr.status) = ANY($${paramIdx})`);
        values.push(statusList);
        paramIdx++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let orderBy: string;
    switch (params.sortField?.toLowerCase()) {
      case "name":
        orderBy = `CONCAT(u.first_name, ' ', u.last_name) ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "status":
        orderBy = `abpr.status ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "assettype":
        orderBy = `COALESCE(NULLIF(abpr.asset_description, ''), at.type) ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "createdat":
        orderBy = `abpr.created_at ${isAsc ? "ASC" : "DESC"}`;
        break;
      default:
        orderBy = `abpr.id DESC`;
        break;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)
       FROM asset_based_payment_requests abpr
       JOIN users u ON abpr.user_id = u.id
       LEFT JOIN campaigns c ON abpr.campaign_id = c.id
       LEFT JOIN asset_types at ON abpr.asset_type_id = at.id
       ${whereClause}`,
      values
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT abpr.id,
              CONCAT(u.first_name, ' ', u.last_name) AS name,
              u.email,
              CASE WHEN c.name IS NOT NULL AND TRIM(c.name) != '' THEN c.name ELSE NULL END AS "investmentName",
              COALESCE(NULLIF(TRIM(abpr.asset_description), ''), at.type) AS "assetType",
              CAST(abpr.approximate_amount AS float) AS "approximateAmount",
              CAST(abpr.received_amount AS float) AS "receivedAmount",
              abpr.contact_method AS "contactMethod",
              abpr.contact_value AS "contactValue",
              COALESCE(NULLIF(TRIM(abpr.status), ''), 'Pending') AS status,
              abpr.created_at AS "createdAt",
              EXISTS(SELECT 1 FROM asset_based_payment_request_notes n WHERE n.request_id = abpr.id) AS "hasNotes",
              abpr.deleted_at AS "deletedAt",
              CASE WHEN del.id IS NOT NULL THEN CONCAT(del.first_name, ' ', del.last_name) ELSE NULL END AS "deletedBy"
       FROM asset_based_payment_requests abpr
       JOIN users u ON abpr.user_id = u.id
       LEFT JOIN campaigns c ON abpr.campaign_id = c.id
       LEFT JOIN asset_types at ON abpr.asset_type_id = at.id
       LEFT JOIN users del ON abpr.deleted_by = del.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, pageSize, (page - 1) * pageSize]
    );

    if (totalCount > 0) {
      res.json({ items: dataResult.rows, totalCount });
    } else {
      res.json({ success: false, message: "Data not found." });
    }
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("Error fetching other assets:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/restore", async (req: Request, res: Response) => {
  try {
    const ids: number[] = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.json({ success: false, message: "No IDs provided." });
      return;
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");

    const assetsResult = await pool.query(
      `SELECT id FROM asset_based_payment_requests WHERE id IN (${placeholders}) AND is_deleted = true`,
      ids
    );

    if (assetsResult.rows.length === 0) {
      res.json({ success: false, message: "No deleted assets found to restore." });
      return;
    }

    const assetIds = assetsResult.rows.map((r: any) => r.id);
    const assetPlaceholders = assetIds.map((_: any, i: number) => `$${i + 1}`).join(", ");

    await pool.query(
      `UPDATE asset_based_payment_requests SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id IN (${assetPlaceholders})`,
      assetIds
    );

    await pool.query(
      `UPDATE account_balance_change_logs SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE asset_based_payment_request_id IN (${assetPlaceholders}) AND is_deleted = true`,
      assetIds
    );

    res.json({ success: true, message: `${assetIds.length} other asset(s) restored successfully.` });
  } catch (err: any) {
    console.error("Error restoring other assets:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id/status", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(String(req.params.id), 10);
    const data = req.body;

    const assetResult = await client.query(
      `SELECT abpr.*, u.id AS uid, u.email AS user_email, u.first_name, u.last_name,
              u.account_balance, u.user_name, u.is_free_user, u.is_active,
              c.id AS camp_id, c.name AS campaign_name,
              at.type AS asset_type_name
       FROM asset_based_payment_requests abpr
       JOIN users u ON abpr.user_id = u.id
       LEFT JOIN campaigns c ON abpr.campaign_id = c.id
       LEFT JOIN asset_types at ON abpr.asset_type_id = at.id
       WHERE abpr.id = $1`,
      [id]
    );

    if (assetResult.rows.length === 0) {
      res.status(400).json({ success: false, message: "Asset payment request not found." });
      return;
    }

    const asset = assetResult.rows[0];
    const loginUserId = req.user?.id;

    if (!loginUserId) {
      res.status(401).json({ success: false, message: "Unauthorized access." });
      return;
    }

    const loginUserResult = await client.query(
      `SELECT user_name FROM users WHERE id = $1`,
      [loginUserId]
    );

    if (loginUserResult.rows.length === 0) {
      res.status(401).json({ success: false, message: "Logged-in user not found." });
      return;
    }

    const loginUserName = loginUserResult.rows[0].user_name?.trim().toLowerCase() || "";

    const oldStatus = asset.status || "Pending";
    const newStatus = data.status || "Pending";

    await client.query("BEGIN");

    if (data.note && data.note.trim()) {
      await client.query(
        `INSERT INTO asset_based_payment_request_notes (request_id, note, old_status, new_status, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [id, data.note.trim(), oldStatus, newStatus, loginUserId]
      );
    }

    if (oldStatus === "Pending" && newStatus === "In Transit") {
      await client.query(`UPDATE asset_based_payment_requests SET status = $1 WHERE id = $2`, [newStatus, id]);
    } else if (oldStatus === "In Transit" && newStatus === "Received") {
      const receivedAmount = data.amount > 0 ? data.amount : parseFloat(asset.received_amount) || 0;

      await client.query(
        `UPDATE asset_based_payment_requests SET received_amount = $1, status = $2 WHERE id = $3`,
        [receivedAmount, newStatus, id]
      );

      const grossAmount = parseFloat(asset.approximate_amount) || 0;
      const netAmount = receivedAmount;
      const fees = grossAmount - netAmount;

      const paymentType = asset.asset_description && asset.asset_description.trim()
        ? `${asset.asset_description}, ${loginUserName}`
        : `${asset.asset_type_name}, ${loginUserName}`;

      const userBalance = parseFloat(asset.account_balance) || 0;
      const newBalance = userBalance + receivedAmount;

      await client.query(
        `INSERT INTO account_balance_change_logs
         (user_id, payment_type, old_value, user_name, new_value, change_date, asset_based_payment_request_id, fees, gross_amount, net_amount)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)`,
        [asset.uid, paymentType, userBalance, asset.user_name, newBalance, id, fees, grossAmount, netAmount]
      );

      await client.query(`UPDATE users SET account_balance = $1, is_free_user = false, is_active = true WHERE id = $2`, [newBalance, asset.uid]);

      if (asset.campaign_id) {
        const updatedBalanceResult = await client.query(`SELECT account_balance FROM users WHERE id = $1`, [asset.uid]);
        let currentBalance = parseFloat(updatedBalanceResult.rows[0].account_balance) || 0;

        let recAmount = currentBalance;
        if (currentBalance < recAmount) {
          recAmount = currentBalance;
        }

        await client.query(
          `INSERT INTO recommendations (user_email, user_full_name, campaign_id, status, amount, date_created, user_id)
           VALUES ($1, $2, $3, 'pending', $4, NOW(), $5)`,
          [
            asset.user_email,
            `${asset.first_name || ""} ${asset.last_name || ""}`.trim(),
            asset.camp_id,
            recAmount,
            asset.uid,
          ]
        );

        if (recAmount > 0) {
          await client.query(
            `INSERT INTO account_balance_change_logs
             (user_id, payment_type, old_value, user_name, new_value, change_date, investment_name, campaign_id)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
            [
              asset.uid,
              "Manually",
              currentBalance,
              asset.user_name,
              currentBalance - recAmount,
              asset.campaign_name,
              asset.camp_id,
            ]
          );

          await client.query(
            `UPDATE users SET account_balance = account_balance - $1 WHERE id = $2`,
            [recAmount, asset.uid]
          );
        }

        await client.query(
          `INSERT INTO user_investments (user_id, payment_type, campaign_name, campaign_id, log_triggered)
           VALUES ($1, $2, $3, $4, true)`,
          [asset.uid, paymentType, asset.campaign_name, asset.camp_id]
        );
      }
    } else if ((oldStatus === "Pending" || oldStatus === "In Transit") && newStatus === "Rejected") {
      await client.query(`UPDATE asset_based_payment_requests SET status = $1 WHERE id = $2`, [newStatus, id]);
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Asset payment status updated successfully." });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating other asset status:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);

    if (id <= 0) {
      res.json({ success: false, message: "Invalid asset payment id" });
      return;
    }

    const result = await pool.query(
      `SELECT n.id, n.old_status AS "oldStatus", n.new_status AS "newStatus",
              n.note, u.user_name AS "userName", n.created_at AS "createdAt"
       FROM asset_based_payment_request_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.request_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (err: any) {
    console.error("Error fetching other asset notes:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT abpr.id, abpr.approximate_amount, abpr.received_amount, abpr.contact_method,
              abpr.contact_value, abpr.status, abpr.created_at, abpr.asset_description,
              u.first_name, u.last_name, u.email,
              c.name AS campaign_name,
              at.type AS asset_type_name
       FROM asset_based_payment_requests abpr
       JOIN users u ON abpr.user_id = u.id
       LEFT JOIN campaigns c ON abpr.campaign_id = c.id
       LEFT JOIN asset_types at ON abpr.asset_type_id = at.id`
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("AssetPaymentRequests");

    const headers = [
      "Name", "Email", "Investment Name", "Asset Type", "Approximate Amount",
      "Received Amount", "Contact Method", "Contact Value", "Status", "Date Created",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const row of result.rows) {
      const fullName = `${row.first_name || ""} ${row.last_name || ""}`.trim();
      const assetType = row.asset_description && row.asset_description.trim()
        ? row.asset_description
        : row.asset_type_name;
      const approxAmount = parseFloat(row.approximate_amount) || 0;
      const receivedAmount = parseFloat(row.received_amount) || 0;
      const dateStr = row.created_at
        ? dayjs.utc(row.created_at).format("MM-DD-YYYY HH:mm")
        : "";

      worksheet.addRow([
        fullName,
        row.email,
        row.campaign_name,
        assetType,
        `$${approxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `$${receivedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        row.contact_method,
        row.contact_value,
        row.status,
        dateStr,
      ]);
    }

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 4;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=AssetPaymentRequests.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting other assets:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);

    const entityResult = await pool.query(
      `SELECT id FROM asset_based_payment_requests WHERE id = $1`,
      [id]
    );

    if (entityResult.rows.length === 0) {
      res.json({ success: false, message: "Other asset not found." });
      return;
    }

    await pool.query(`DELETE FROM account_balance_change_logs WHERE asset_based_payment_request_id = $1`, [id]);
    await pool.query(`DELETE FROM asset_based_payment_requests WHERE id = $1`, [id]);

    res.json({ success: true, message: "Other asset deleted successfully." });
  } catch (err: any) {
    console.error("Error deleting other asset:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
