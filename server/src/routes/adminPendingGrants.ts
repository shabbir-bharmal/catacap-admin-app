import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter } from "../utils/softDelete.js";
import ExcelJS from "exceljs";

const router = Router();

function getReadableDuration(from: Date, to: Date): string {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);

  return parts.length > 0 ? parts.join(", ") : "0 days";
}

router.get("/daf-providers", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, provider_name AS "value", provider_url AS "link" FROM daf_providers`
    );

    res.json(result.rows);
  } catch (err: any) {
    console.error("Error fetching DAF providers:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT pg.id, pg.amount, pg.amount_after_fees, pg.daf_provider, pg.daf_name,
              pg.reference, pg.status, pg.created_date, pg.address,
              u.first_name, u.last_name, u.email,
              c.name AS campaign_name
       FROM pending_grants pg
       JOIN users u ON pg.user_id = u.id
       LEFT JOIN campaigns c ON pg.campaign_id = c.id
       ORDER BY pg.id DESC`
    );

    const now = new Date();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("PendingGrants");

    const headers = [
      "Full Name", "Email", "Original Amount", "Amount After Fees", "DAF Provider", "DAF Name",
      "Investment Name", "Grant Source", "Status", "Address", "Date Created", "Day Count",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const row of result.rows) {
      const fullName = `${row.first_name || ""} ${row.last_name || ""}`.trim();
      const status = row.status || "Pending";
      const amount = parseFloat(row.amount) || 0;
      const amountAfterFees = parseFloat(row.amount_after_fees) || 0;

      const createdDate = row.created_date ? new Date(row.created_date) : null;
      const dateStr = createdDate
        ? `${String(createdDate.getMonth() + 1).padStart(2, "0")}-${String(createdDate.getDate()).padStart(2, "0")}-${createdDate.getFullYear()} ${String(createdDate.getHours()).padStart(2, "0")}:${String(createdDate.getMinutes()).padStart(2, "0")}`
        : "";

      let dayCount = "";
      if ((!row.status || row.status.toLowerCase() === "pending") && createdDate) {
        dayCount = getReadableDuration(createdDate, now);
      }

      worksheet.addRow([
        fullName,
        row.email,
        `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `$${amountAfterFees.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        row.daf_provider,
        row.daf_name,
        row.campaign_name,
        row.reference,
        status,
        row.address,
        dateStr,
        dayCount,
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
    res.setHeader("Content-Disposition", "attachment; filename=PendingGrants.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting pending grants:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const page = params.currentPage;
    const pageSize = params.perPage;

    const dafProvider = (req.query.dafProvider || req.query.DafProvider) as string | undefined;

    const statusList = params.status
      ? params.status.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    softDeleteFilter("pg", params.isDeleted, conditions);

    if (statusList && statusList.length > 0) {
      if (statusList.includes("pending")) {
        const otherStatuses = statusList.filter((s) => s !== "pending");
        if (otherStatuses.length > 0) {
          conditions.push(`(pg.status IS NULL OR pg.status = '' OR LOWER(pg.status) = ANY($${paramIdx}))`);
          values.push(statusList);
          paramIdx++;
        } else {
          conditions.push(`(pg.status IS NULL OR pg.status = '' OR LOWER(pg.status) = 'pending')`);
        }
      } else {
        conditions.push(`pg.status IS NOT NULL AND pg.status != '' AND LOWER(pg.status) = ANY($${paramIdx})`);
        values.push(statusList);
        paramIdx++;
      }
    }

    if (params.searchValue) {
      conditions.push(`(
        LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE $${paramIdx}
        OR LOWER(u.email) LIKE $${paramIdx}
      )`);
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    if (dafProvider) {
      const dafProviderList = dafProvider.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (dafProviderList.length === 1) {
        conditions.push(`LOWER(TRIM(pg.daf_provider)) = LOWER(TRIM($${paramIdx}))`);
        values.push(dafProviderList[0]);
        paramIdx++;
      } else if (dafProviderList.length > 1) {
        conditions.push(`LOWER(TRIM(pg.daf_provider)) = ANY($${paramIdx})`);
        values.push(dafProviderList);
        paramIdx++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)
       FROM pending_grants pg
       JOIN users u ON pg.user_id = u.id
       LEFT JOIN campaigns c ON pg.campaign_id = c.id
       ${whereClause}`,
      values
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    let orderBy: string;
    switch (params.sortField?.toLowerCase()) {
      case "fullname":
        orderBy = `CASE WHEN LOWER(COALESCE(pg.status, 'pending')) = 'rejected' THEN 1 ELSE 0 END ASC, u.first_name ${isAsc ? "ASC" : "DESC"}, u.last_name ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "createddate":
        orderBy = `CASE WHEN LOWER(COALESCE(pg.status, 'pending')) = 'rejected' THEN 1 ELSE 0 END ASC, pg.created_date ${isAsc ? "ASC NULLS LAST" : "DESC NULLS FIRST"}`;
        break;
      case "status":
        orderBy = `COALESCE(pg.status, 'Pending') ${isAsc ? "ASC" : "DESC"}`;
        break;
      case "dayscount":
        orderBy = `CASE WHEN LOWER(COALESCE(pg.status, 'pending')) = 'pending' OR pg.status IS NULL OR pg.status = '' THEN 0 ELSE 1 END ASC, pg.created_date ${isAsc ? "ASC NULLS LAST" : "DESC NULLS FIRST"}`;
        break;
      default:
        orderBy = `CASE WHEN LOWER(COALESCE(pg.status, 'pending')) = 'rejected' THEN 1 ELSE 0 END ASC, pg.created_date DESC`;
        break;
    }

    const dataResult = await pool.query(
      `SELECT pg.id, u.first_name AS "firstName", u.last_name AS "lastName",
              u.email, CAST(pg.amount AS float) AS amount, CAST(pg.amount_after_fees AS float) AS "amountAfterFees",
              pg.daf_name AS "dafName", pg.daf_provider AS "dafProvider",
              c.name AS "investmentName", pg.reference,
              COALESCE(NULLIF(pg.status, ''), 'Pending') AS status,
              pg.created_date AS "createdDate",
              EXISTS(SELECT 1 FROM pending_grant_notes n WHERE n.pending_grant_id = pg.id) AS "hasNotes",
              pg.deleted_at AS "deletedAt",
              CASE WHEN del.id IS NOT NULL THEN CONCAT(del.first_name, ' ', del.last_name) ELSE NULL END AS "deletedBy"
       FROM pending_grants pg
       JOIN users u ON pg.user_id = u.id
       LEFT JOIN campaigns c ON pg.campaign_id = c.id
       LEFT JOIN users del ON pg.deleted_by = del.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, pageSize, (page - 1) * pageSize]
    );

    const now = new Date();
    const pagedData = dataResult.rows.map((row: any) => {
      const status = row.status || "Pending";
      let daysCount: string | null = null;

      if (status.toLowerCase() === "pending" && row.createdDate) {
        daysCount = getReadableDuration(new Date(row.createdDate), now);
      }

      return {
        ...row,
        fullName: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
        status,
        daysCount,
      };
    });

    if (pagedData.length > 0) {
      res.json({ items: pagedData, totalCount });
    } else {
      res.json({ success: false, message: "Data not found." });
    }
  } catch (err: any) {
    console.error("Error fetching pending grants:", err);
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

    const grantsResult = await pool.query(
      `SELECT id FROM pending_grants WHERE id IN (${placeholders}) AND is_deleted = true`,
      ids
    );

    if (grantsResult.rows.length === 0) {
      res.json({ success: false, message: "No deleted pending grants found." });
      return;
    }

    const grantIds = grantsResult.rows.map((r: any) => r.id);
    const grantPlaceholders = grantIds.map((_: any, i: number) => `$${i + 1}`).join(", ");

    await pool.query(
      `UPDATE pending_grants SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id IN (${grantPlaceholders})`,
      grantIds
    );

    await pool.query(
      `UPDATE account_balance_change_logs SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE pending_grants_id IN (${grantPlaceholders}) AND is_deleted = true`,
      grantIds
    );

    await pool.query(
      `UPDATE recommendations SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE pending_grants_id IN (${grantPlaceholders}) AND is_deleted = true`,
      grantIds
    );

    await pool.query(
      `UPDATE scheduled_email_logs SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE pending_grant_id IN (${grantPlaceholders}) AND is_deleted = true`,
      grantIds
    );

    res.json({ success: true, message: `${grantIds.length} pending grant(s) restored successfully.` });
  } catch (err: any) {
    console.error("Error restoring pending grants:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const id = parseInt(String(req.params.id), 10);
    const data = req.body;

    const grantResult = await client.query(
      `SELECT pg.*, u.id AS uid, u.email AS user_email, u.first_name, u.last_name,
              u.account_balance, u.user_name, u.is_free_user,
              c.id AS camp_id, c.name AS campaign_name
       FROM pending_grants pg
       JOIN users u ON pg.user_id = u.id
       LEFT JOIN campaigns c ON pg.campaign_id = c.id
       WHERE pg.id = $1`,
      [id]
    );

    if (grantResult.rows.length === 0) {
      res.status(400).json({ success: false, message: "Wrong pending grand id." });
      return;
    }

    const grant = grantResult.rows[0];
    const currentStatus = grant.status || "Pending";
    const pendingGrantAmount = parseFloat(grant.amount) || 0;
    const loginUserId = req.user?.id;

    const loginUserResult = await client.query(
      `SELECT user_name FROM users WHERE id = $1`,
      [loginUserId]
    );
    const loginUserName = loginUserResult.rows[0]?.user_name?.trim().toLowerCase() || "";

    await client.query("BEGIN");
    await client.query(`UPDATE pending_grants SET modified_date = NOW() WHERE id = $1`, [id]);

    if (data.status === "In Transit" && currentStatus === "Pending") {
      const userBalance = parseFloat(grant.account_balance) || 0;

      const totalCataCapFee = pendingGrantAmount * 0.05;
      const amountAfterFees = grant.amount_after_fees > 0
        ? parseFloat(grant.amount_after_fees) || 0
        : pendingGrantAmount - totalCataCapFee;

      const groupAccountBalances = await client.query(
        `SELECT gab.id, gab.balance, gab.group_id
         FROM group_account_balance gab
         WHERE gab.user_id = $1
         ORDER BY gab.id ASC`,
        [grant.uid]
      );
      const totalGroupBalance = groupAccountBalances.rows.reduce(
        (sum: number, r: any) => sum + (parseFloat(r.balance) || 0), 0
      );

      const investedSum = parseFloat(grant.invested_sum) || parseFloat(grant.total_invested_amount) || 0;
      const fromWallet = investedSum - (pendingGrantAmount + totalGroupBalance);
      if (userBalance < fromWallet) {
        await client.query("ROLLBACK");
        res.json({ success: false, message: "User do not have sufficient wallet balance." });
        return;
      }

      const grantType = grant.daf_provider.toLowerCase().trim() === "foundation grant"
        ? "Foundation grant"
        : "DAF grant";

      const fees = (parseFloat(grant.grant_amount) || 0) - (parseFloat(grant.amount_after_fees) || 0);
      const paymentType = `${grantType}, ${loginUserName}`;

      const oldBalance = userBalance;
      const newBalance = userBalance + amountAfterFees;

      let zipCode: string | null = null;
      if (grant.address) {
        try {
          const address = JSON.parse(grant.address);
          zipCode = address?.ZipCode || address?.zipCode || null;
        } catch {}
      }

      await client.query(
        `INSERT INTO account_balance_change_logs
         (user_id, payment_type, old_value, user_name, new_value, change_date, pending_grants_id, fees, gross_amount, net_amount, reference, zip_code)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11)`,
        [
          grant.uid, paymentType, oldBalance, grant.user_name, newBalance,
          id, fees >= 0 ? fees : 0, pendingGrantAmount, amountAfterFees,
          grant.reference?.trim() || null, zipCode,
        ]
      );

      await client.query(`UPDATE users SET account_balance = $1, is_free_user = false WHERE id = $2`, [newBalance, grant.uid]);
      await client.query(`UPDATE pending_grants SET status = 'In Transit' WHERE id = $1`, [id]);

      if (grant.camp_id) {
        const totalAvailable = newBalance + totalGroupBalance;
        const finalInvestmentAmount = Math.min(totalAvailable, investedSum);

        await client.query(
          `INSERT INTO recommendations (user_email, user_full_name, campaign_id, status, amount, date_created, pending_grants_id, user_id)
           VALUES ($1, $2, $3, 'pending', $4, NOW(), $5, $6)`,
          [
            grant.user_email,
            `${grant.first_name || ""} ${grant.last_name || ""}`.trim(),
            grant.camp_id,
            finalInvestmentAmount,
            id,
            grant.uid,
          ]
        );

        let amountToDeduct = finalInvestmentAmount;

        for (const gab of groupAccountBalances.rows) {
          if (amountToDeduct <= 0) break;
          const gabBalance = parseFloat(gab.balance) || 0;
          if (gabBalance <= 0) continue;
          const deduction = Math.min(gabBalance, amountToDeduct);

          await client.query(
            `INSERT INTO account_balance_change_logs
             (user_id, payment_type, old_value, user_name, new_value, change_date, investment_name, campaign_id, group_id)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
            [
              grant.uid,
              `Manually, ${loginUserName}`,
              gabBalance,
              grant.user_name,
              gabBalance - deduction,
              grant.campaign_name,
              grant.camp_id,
              gab.group_id,
            ]
          );

          await client.query(
            `UPDATE group_account_balance SET balance = balance - $1 WHERE id = $2`,
            [deduction, gab.id]
          );

          amountToDeduct -= deduction;
        }

        if (amountToDeduct > 0) {
          const curUserResult = await client.query(`SELECT account_balance FROM users WHERE id = $1`, [grant.uid]);
          let curBalance = parseFloat(curUserResult.rows[0].account_balance) || 0;
          if (curBalance < amountToDeduct) {
            amountToDeduct = curBalance;
          }

          await client.query(
            `INSERT INTO account_balance_change_logs
             (user_id, payment_type, old_value, user_name, new_value, change_date, investment_name, campaign_id)
             VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
            [
              grant.uid,
              `${grantType}, ${loginUserName}`,
              curBalance,
              grant.user_name,
              curBalance - amountToDeduct,
              grant.campaign_name,
              grant.camp_id,
            ]
          );

          await client.query(
            `UPDATE users SET account_balance = account_balance - $1 WHERE id = $2`,
            [amountToDeduct, grant.uid]
          );
        }

        await client.query(
          `INSERT INTO user_investments (user_id, payment_type, campaign_name, campaign_id, log_trigger_e_d)
           VALUES ($1, $2, $3, $4, true)`,
          [grant.uid, `Manually, ${loginUserName}`, grant.campaign_name, grant.camp_id]
        );
      }

      await client.query(`UPDATE users SET is_active = true, is_free_user = false WHERE id = $1`, [grant.uid]);
    } else if (data.status === "Rejected") {
      if (currentStatus === "In Transit") {
        await client.query(
          `UPDATE pending_grants SET status = 'Rejected', rejected_by = $1, rejection_memo = $2, rejection_date = NOW() WHERE id = $3`,
          [loginUserId, data.rejectionMemo?.trim() || null, id]
        );

        if (!grant.camp_id) {
          const existingLogResult = await client.query(
            `SELECT abl.*, pg.amount_after_fees AS pg_amount_after_fees
             FROM account_balance_change_logs abl
             JOIN pending_grants pg ON abl.pending_grants_id = pg.id
             WHERE abl.user_id = $1 AND abl.pending_grants_id = $2
             ORDER BY abl.id DESC LIMIT 1`,
            [grant.uid, id]
          );

          if (existingLogResult.rows.length > 0) {
            const existingLog = existingLogResult.rows[0];
            const revertAmount = -(parseFloat(existingLog.pg_amount_after_fees) || 0);
            const currentBalance = (await client.query(`SELECT account_balance FROM users WHERE id = $1`, [grant.uid])).rows[0].account_balance;
            const curBal = parseFloat(currentBalance) || 0;

            await client.query(
              `INSERT INTO account_balance_change_logs
               (user_id, payment_type, old_value, user_name, new_value, change_date, pending_grants_id, reference)
               VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
              [
                grant.uid,
                `Pending grant reverted, id = ${id}`,
                curBal,
                grant.user_name,
                curBal + revertAmount,
                id,
                existingLog.reference,
              ]
            );

            await client.query(`UPDATE users SET account_balance = $1 WHERE id = $2`, [curBal + revertAmount, grant.uid]);
          }
        } else {
          const recResult = await client.query(
            `SELECT r.*, c.name AS camp_name, c.id AS camp_id
             FROM recommendations r
             LEFT JOIN campaigns c ON r.campaign_id = c.id
             WHERE r.user_email = $1 AND r.campaign_id = $2 AND r.pending_grants_id = $3`,
            [grant.user_email, grant.camp_id, id]
          );

          const existingLogResult = await client.query(
            `SELECT * FROM account_balance_change_logs
             WHERE user_id = $1
             ORDER BY id DESC LIMIT 1`,
            [grant.uid]
          );

          if (existingLogResult.rows.length > 0) {
            const existingLog = existingLogResult.rows[0];
            const recommendation = recResult.rows.length > 0 ? recResult.rows[0] : null;

            const amountAfterFees = grant.amount_after_fees != null
              ? parseFloat(grant.amount_after_fees)
              : pendingGrantAmount - (pendingGrantAmount * 0.05);

            if (recommendation && recommendation.status !== "rejected") {
              const recAmount = parseFloat(recommendation.amount) || 0;
              const curBal1 = (await client.query(`SELECT account_balance FROM users WHERE id = $1`, [grant.uid])).rows[0];
              const curBalance1 = parseFloat(curBal1.account_balance) || 0;

              await client.query(
                `INSERT INTO account_balance_change_logs
                 (user_id, payment_type, old_value, user_name, new_value, change_date, pending_grants_id, reference, investment_name, campaign_id)
                 VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)`,
                [
                  grant.uid,
                  `Recommendation reverted due to pending grant rollback, id = ${recommendation.id}`,
                  curBalance1,
                  grant.user_name,
                  curBalance1 + recAmount,
                  id,
                  existingLog.reference,
                  recommendation.camp_name,
                  recommendation.camp_id,
                ]
              );

              await client.query(`UPDATE users SET account_balance = $1 WHERE id = $2`, [curBalance1 + recAmount, grant.uid]);
            }

            const curBal2 = (await client.query(`SELECT account_balance FROM users WHERE id = $1`, [grant.uid])).rows[0];
            const curBalance2 = parseFloat(curBal2.account_balance) || 0;

            await client.query(
              `INSERT INTO account_balance_change_logs
               (user_id, payment_type, old_value, user_name, new_value, change_date, pending_grants_id, reference)
               VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)`,
              [
                grant.uid,
                `Pending grant reverted, id = ${id}`,
                curBalance2,
                grant.user_name,
                curBalance2 - amountAfterFees,
                id,
                existingLog.reference,
              ]
            );

            await client.query(`UPDATE users SET account_balance = $1 WHERE id = $2`, [curBalance2 - amountAfterFees, grant.uid]);

            if (recommendation) {
              await client.query(`UPDATE recommendations SET status = 'rejected' WHERE id = $1`, [recommendation.id]);
            }
          }
        }
      } else if (currentStatus === "Pending") {
        await client.query(
          `UPDATE pending_grants SET status = 'Rejected', rejected_by = $1, rejection_memo = $2, rejection_date = NOW() WHERE id = $3`,
          [loginUserId, data.rejectionMemo?.trim() || null, id]
        );
      }
    } else if (data.status === "Received" && currentStatus === "In Transit") {
      await client.query(`UPDATE pending_grants SET status = 'Received' WHERE id = $1`, [id]);
    }

    if (data.note && data.note.trim()) {
      await client.query(
        `INSERT INTO pending_grant_notes (pending_grant_id, note, created_by, created_at, old_status, new_status)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [id, data.note.trim(), loginUserId, currentStatus, data.status]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, message: `Grant set ${data.status}` });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating pending grant:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);

    const result = await pool.query(
      `SELECT n.id, n.old_status AS "oldStatus", n.new_status AS "newStatus",
              n.note, u.user_name AS "userName", n.created_at AS "createdAt"
       FROM pending_grant_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.pending_grant_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (err: any) {
    console.error("Error fetching pending grant notes:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);

    const entityResult = await pool.query(
      `SELECT id FROM pending_grants WHERE id = $1`,
      [id]
    );

    if (entityResult.rows.length === 0) {
      res.json({ success: false, message: "Pending grant not found." });
      return;
    }

    await pool.query(`DELETE FROM account_balance_change_logs WHERE pending_grants_id = $1`, [id]);
    await pool.query(`DELETE FROM recommendations WHERE pending_grants_id = $1`, [id]);
    await pool.query(`DELETE FROM scheduled_email_logs WHERE pending_grant_id = $1`, [id]);
    await pool.query(`DELETE FROM pending_grant_notes WHERE pending_grant_id = $1`, [id]);
    await pool.query(`DELETE FROM pending_grants WHERE id = $1`, [id]);

    res.json({ success: true, message: "Pending grant deleted successfully." });
  } catch (err: any) {
    console.error("Error deleting pending grant:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
