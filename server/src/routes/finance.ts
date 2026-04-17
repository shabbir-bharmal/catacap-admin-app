import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import ExcelJS from "exceljs";

const router = Router();

const USER_ROLE = "User";
const PENDING = "pending";
const APPROVED = "approved";
const REJECTED = "rejected";
const IN_TRANSIT = "in transit";
const ACCEPTED = "accepted";

interface FinancesData {
  users: { active: number; inactive: number; accountBalances: number; investments: number; investmentsPlusAccountBalances: number };
  groups: { investments: number; leaders: number; members: number; corporate: number };
  recommendations: { pending: number; approved: number; rejected: number; approvedAndPending: number; total: number };
  investments: { average: number; active: number; over25K: number; over50K: number; completed: number; totalActive: number; totalCompleted: number; totalActiveAndClosed: number; assets: number };
  investmentThemes: Array<{ name: string; pending: number; approved: number; total: number }>;
  grants: { pendingAndInTransit: number; pendingAndInTransitOtherAssets: number };
  toBalance: { recommendations: number; activeAndClosed: number; difference: number };
}

async function getFinancesData(): Promise<FinancesData> {
    const userStatsResult = await pool.query(
      `SELECT
         COUNT(CASE WHEN u.is_active = true THEN 1 END) AS active,
         COUNT(CASE WHEN u.is_active = false THEN 1 END) AS inactive,
         COALESCE(SUM(u.account_balance), 0) AS account_balances
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = $1
         AND (u.is_deleted IS NULL OR u.is_deleted = false)`,
      [USER_ROLE]
    );
    const userStats = userStatsResult.rows[0];

    const userAccountBalancesResult = await pool.query(
      `SELECT COALESCE(SUM(u.account_balance), 0) AS account_balances
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = $1
         AND u.is_exclude_user_balance = false
         AND (u.is_deleted IS NULL OR u.is_deleted = false)`,
      [USER_ROLE]
    );
    const userAccountBalances = parseFloat(userAccountBalancesResult.rows[0].account_balances) || 0;

    const userIdsResult = await pool.query(
      `SELECT u.id
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = $1
         AND (u.is_deleted IS NULL OR u.is_deleted = false)`,
      [USER_ROLE]
    );
    const userIds = userIdsResult.rows.map((r) => r.id);

    const userEmailsResult = await pool.query(
      `SELECT LOWER(u.email) AS email
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = $1
         AND (u.is_deleted IS NULL OR u.is_deleted = false)`,
      [USER_ROLE]
    );
    const userEmails = userEmailsResult.rows.map((r) => r.email);

    const nonExcludeEmailsResult = await pool.query(
      `SELECT LOWER(u.email) AS email
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = $1
         AND u.is_exclude_user_balance = false
         AND (u.is_deleted IS NULL OR u.is_deleted = false)`,
      [USER_ROLE]
    );
    const nonExcludeEmails = nonExcludeEmailsResult.rows.map((r) => r.email);

    let groupCount = 0;
    let leadersCount = 0;
    let corporateCount = 0;
    let groupIds: number[] = [];

    if (userIds.length > 0) {
      const userIdPlaceholders = userIds.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const groupsResult = await pool.query(
        `SELECT id, leaders, is_corporate_group
         FROM groups
         WHERE owner_id IN (${userIdPlaceholders})
           AND (is_deleted IS NULL OR is_deleted = false)`,
        userIds
      );

      groupCount = groupsResult.rows.length;
      groupIds = groupsResult.rows.map((g) => g.id);
      corporateCount = groupsResult.rows.filter((g) => g.is_corporate_group === true).length;

      for (const group of groupsResult.rows) {
        if (group.leaders) {
          try {
            const parsed = JSON.parse(group.leaders);
            if (Array.isArray(parsed)) {
              leadersCount += parsed.length;
            }
          } catch {
            // skip
          }
        }
      }
    }

    let membersCount = 0;
    if (groupIds.length > 0) {
      const gidPlaceholders = groupIds.map((_: number, i: number) => `$${i + 1}`).join(", ");
      const membersResult = await pool.query(
        `SELECT COUNT(*) AS total
         FROM requests
         WHERE group_to_follow_id IN (${gidPlaceholders})
           AND status = $${groupIds.length + 1}
           AND (is_deleted IS NULL OR is_deleted = false)`,
        [...groupIds, ACCEPTED]
      );
      membersCount = parseInt(membersResult.rows[0].total) || 0;
    }

    let recStats = { pending: 0, approved: 0, rejected: 0, approvedCount: 0, approvedAndPendingCount: 0 };
    if (userEmails.length > 0) {
      const emailPlaceholders = userEmails.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const recResult = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(TRIM(status)) = '${PENDING}' THEN amount ELSE 0 END), 0) AS pending,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(status)) = '${APPROVED}' THEN amount ELSE 0 END), 0) AS approved,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(status)) = '${REJECTED}' THEN amount ELSE 0 END), 0) AS rejected,
           COUNT(CASE WHEN LOWER(TRIM(status)) = '${APPROVED}' THEN 1 END) AS approved_count,
           COUNT(CASE WHEN LOWER(TRIM(status)) = '${PENDING}' OR LOWER(TRIM(status)) = '${APPROVED}' THEN 1 END) AS approved_and_pending_count
         FROM recommendations
         WHERE LOWER(user_email) IN (${emailPlaceholders})
           AND (is_deleted IS NULL OR is_deleted = false)`,
        userEmails
      );
      if (recResult.rows[0]) {
        recStats = {
          pending: parseFloat(recResult.rows[0].pending) || 0,
          approved: parseFloat(recResult.rows[0].approved) || 0,
          rejected: parseFloat(recResult.rows[0].rejected) || 0,
          approvedCount: parseInt(recResult.rows[0].approved_count) || 0,
          approvedAndPendingCount: parseInt(recResult.rows[0].approved_and_pending_count) || 0,
        };
      }
    }

    let nonExcludeRecStats = { pending: 0, approved: 0 };
    if (nonExcludeEmails.length > 0) {
      const nePlaceholders = nonExcludeEmails.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const neRecResult = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN LOWER(TRIM(status)) = '${PENDING}' THEN amount ELSE 0 END), 0) AS pending,
           COALESCE(SUM(CASE WHEN LOWER(TRIM(status)) = '${APPROVED}' THEN amount ELSE 0 END), 0) AS approved
         FROM recommendations
         WHERE LOWER(user_email) IN (${nePlaceholders})
           AND (is_deleted IS NULL OR is_deleted = false)`,
        nonExcludeEmails
      );
      if (neRecResult.rows[0]) {
        nonExcludeRecStats = {
          pending: parseFloat(neRecResult.rows[0].pending) || 0,
          approved: parseFloat(neRecResult.rows[0].approved) || 0,
        };
      }
    }

    const campaignStatsResult = await pool.query(
      `SELECT COUNT(CASE WHEN is_active = true THEN 1 END) AS active
       FROM campaigns
       WHERE (is_deleted IS NULL OR is_deleted = false)`
    );
    const activeCampaigns = parseInt(campaignStatsResult.rows[0].active) || 0;

    let totalAccountChangeLogs = 0;
    if (userIds.length > 0) {
      const uidPlaceholders = userIds.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const aclResult = await pool.query(
        `SELECT COALESCE(SUM(old_value - new_value), 0) AS total
         FROM account_balance_change_logs
         WHERE investment_name IS NOT NULL AND investment_name != ''
           AND (transaction_status IS NULL OR transaction_status = '')
           AND user_id IN (${uidPlaceholders})
           AND (is_deleted IS NULL OR is_deleted = false)`,
        userIds
      );
      totalAccountChangeLogs = parseFloat(aclResult.rows[0].total) || 0;
    }

    let grantsTotal = 0;
    if (userIds.length > 0) {
      const uidPlaceholders = userIds.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const grantsResult = await pool.query(
        `SELECT amount
         FROM pending_grants
         WHERE (LOWER(TRIM(status)) = '${PENDING}'
            OR (LOWER(TRIM(status)) = '${IN_TRANSIT}'
                AND user_id IN (${uidPlaceholders})))
           AND (is_deleted IS NULL OR is_deleted = false)`,
        userIds
      );
      grantsTotal = grantsResult.rows.reduce((sum, r) => {
        const val = parseFloat(r.amount);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    }

    let totalAssets = 0;
    if (userIds.length > 0) {
      const uidPlaceholders = userIds.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const assetsResult = await pool.query(
        `SELECT COALESCE(SUM(approximate_amount), 0) AS total
         FROM asset_based_payment_requests
         WHERE (LOWER(TRIM(status)) = '${PENDING}'
            OR (LOWER(TRIM(status)) = '${IN_TRANSIT}'
                AND user_id IN (${uidPlaceholders})))
           AND (is_deleted IS NULL OR is_deleted = false)`,
        userIds
      );
      totalAssets = parseFloat(assetsResult.rows[0].total) || 0;
    }

    let campaignTotals: Array<{ campaignId: number; isActive: boolean; totalAmount: number }> = [];
    if (userEmails.length > 0) {
      const emailPlaceholders = userEmails.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const ctResult = await pool.query(
        `SELECT r.campaign_id, c.is_active, SUM(r.amount) AS total_amount
         FROM recommendations r
         JOIN campaigns c ON r.campaign_id = c.id AND (c.is_deleted IS NULL OR c.is_deleted = false)
         WHERE LOWER(r.user_email) IN (${emailPlaceholders})
           AND (LOWER(TRIM(r.status)) = '${APPROVED}' OR LOWER(TRIM(r.status)) = '${PENDING}')
           AND r.amount > 0
           AND r.user_email IS NOT NULL AND r.user_email != ''
           AND (r.is_deleted IS NULL OR r.is_deleted = false)
         GROUP BY r.campaign_id, c.is_active`,
        userEmails
      );
      campaignTotals = ctResult.rows.map((r) => ({
        campaignId: r.campaign_id,
        isActive: r.is_active === true,
        totalAmount: parseFloat(r.total_amount) || 0,
      }));
    }

    const over25k = campaignTotals.filter((x) => x.isActive && x.totalAmount > 25000).length;
    const over50k = campaignTotals.filter((x) => x.isActive && x.totalAmount > 50000).length;
    const totalActive = campaignTotals
      .filter((x) => x.isActive)
      .reduce((sum, x) => sum + x.totalAmount, 0);
    const totalClosed = campaignTotals.reduce((sum, x) => sum + x.totalAmount, 0);

    const completedResult = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM completed_investment_details
       WHERE (is_deleted IS NULL OR is_deleted = false)`
    );
    const completedCount = parseInt(completedResult.rows[0].count) || 0;
    const totalCompleted = parseFloat(completedResult.rows[0].total) || 0;

    const allThemesResult = await pool.query(
      `SELECT id, name FROM themes WHERE (is_deleted IS NULL OR is_deleted = false)`
    );
    const allThemes = allThemesResult.rows;

    const rawCampaignThemesResult = await pool.query(
      `SELECT id, themes FROM campaigns WHERE (is_deleted IS NULL OR is_deleted = false)`
    );
    const campaignThemesMap = new Map<number, number[]>();
    for (const c of rawCampaignThemesResult.rows) {
      const themeIds = c.themes
        ? c.themes
            .split(",")
            .map((t: string) => parseInt(t.trim(), 10))
            .filter((n: number) => !isNaN(n))
        : [];
      campaignThemesMap.set(Number(c.id), themeIds);
    }

    let relevantRecs: Array<{ campaign_id: number; amount: number; status: string }> = [];
    if (userEmails.length > 0) {
      const emailPlaceholders = userEmails.map((_: string, i: number) => `$${i + 1}`).join(", ");
      const rrResult = await pool.query(
        `SELECT campaign_id, amount, status
         FROM recommendations
         WHERE LOWER(user_email) IN (${emailPlaceholders})
           AND (LOWER(TRIM(status)) = '${PENDING}' OR LOWER(TRIM(status)) = '${APPROVED}')
           AND (is_deleted IS NULL OR is_deleted = false)`,
        userEmails
      );
      relevantRecs = rrResult.rows;
    }

    const themeStats = allThemes.map((theme) => {
      let pendingTotal = 0;
      let approvedTotal = 0;

      for (const rec of relevantRecs) {
        const themeIds = campaignThemesMap.get(rec.campaign_id) || [];
        if (!themeIds.includes(Number(theme.id))) continue;
        const splitAmount = themeIds.length > 0 ? (parseFloat(String(rec.amount)) || 0) / themeIds.length : 0;
        const status = (rec.status || "").toLowerCase().trim();
        if (status === PENDING) pendingTotal += splitAmount;
        if (status === APPROVED) approvedTotal += splitAmount;
      }

      return {
        name: theme.name,
        pending: Math.round(pendingTotal * 100) / 100,
        approved: Math.round(approvedTotal * 100) / 100,
        total: Math.round((pendingTotal + approvedTotal) * 100) / 100,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const allAccountBalances = parseFloat(userStats.account_balances) || 0;
    const userInvestments = nonExcludeRecStats.pending + nonExcludeRecStats.approved;
    const recTotal = recStats.pending + recStats.approved;

    const financesDto = {
      users: {
        active: parseInt(userStats.active) || 0,
        inactive: parseInt(userStats.inactive) || 0,
        accountBalances: userAccountBalances,
        investments: userInvestments,
        investmentsPlusAccountBalances: userAccountBalances + userInvestments,
      },
      groups: {
        investments: groupCount,
        leaders: leadersCount,
        members: membersCount,
        corporate: corporateCount,
      },
      recommendations: {
        pending: recStats.pending,
        approved: recStats.approved,
        rejected: recStats.rejected,
        approvedAndPending: recStats.approvedAndPendingCount,
        total: recTotal,
      },
      investments: {
        average: recStats.approvedCount > 0 ? recStats.approved / recStats.approvedCount : 0,
        active: activeCampaigns,
        over25K: over25k,
        over50K: over50k,
        completed: completedCount,
        totalActive: totalActive,
        totalCompleted: totalCompleted,
        totalActiveAndClosed: totalClosed,
        assets: allAccountBalances + recTotal,
      },
      investmentThemes: themeStats,
      grants: {
        pendingAndInTransit: grantsTotal,
        pendingAndInTransitOtherAssets: totalAssets,
      },
      toBalance: {
        recommendations: recTotal,
        activeAndClosed: totalAccountChangeLogs,
        difference: recTotal - totalAccountChangeLogs,
      },
    };

    return financesDto;
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await getFinancesData();
    res.json(data);
  } catch (err) {
    console.error("Consolidated finances error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const data = await getFinancesData();

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Consolidated Finances");

    ws.getColumn(1).width = 70;
    ws.getColumn(2).width = 22;

    let rowNum = 1;

    const titleCell = ws.getCell(rowNum, 1);
    titleCell.value = "Consolidated Finances";
    titleCell.font = { bold: true, size: 16 };
    ws.mergeCells(rowNum, 1, rowNum, 2);
    rowNum += 1;

    const addSectionHeader = (title: string) => {
      const cell = ws.getCell(rowNum, 1);
      cell.value = title;
      cell.font = { bold: true, size: 13 };
      ws.mergeCells(rowNum, 1, rowNum, 2);
      ws.getRow(rowNum).height = 30;
      rowNum++;
    };

    const addRow = (label: string, value: string | number) => {
      ws.getCell(rowNum, 1).value = label;
      const valCell = ws.getCell(rowNum, 2);
      valCell.value = value;
      valCell.alignment = { horizontal: "right" };
      ws.getRow(rowNum).height = 20;
      rowNum++;
    };

    const addCurrencyRow = (label: string, value: number) => {
      ws.getCell(rowNum, 1).value = label;
      const valCell = ws.getCell(rowNum, 2);
      valCell.value = value;
      valCell.numFmt = '"$"#,##0.00';
      valCell.alignment = { horizontal: "right" };
      ws.getRow(rowNum).height = 20;
      rowNum++;
    };

    const addTotalRow = (label: string, value: number) => {
      const labelCell = ws.getCell(rowNum, 1);
      const valCell = ws.getCell(rowNum, 2);
      labelCell.value = label;
      valCell.value = value;
      valCell.numFmt = '"$"#,##0.00';
      valCell.alignment = { horizontal: "right" };
      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD3D3D3" },
      };
      labelCell.fill = fill;
      valCell.fill = fill;
      ws.getRow(rowNum).height = 20;
      rowNum++;
    };

    const addBalanceRow = (label: string, value: number) => {
      const labelCell = ws.getCell(rowNum, 1);
      const valCell = ws.getCell(rowNum, 2);
      labelCell.value = label;
      valCell.value = value;
      valCell.numFmt = '"$"#,##0.00';
      valCell.alignment = { horizontal: "right" };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2B547F" },
      };
      labelCell.font = { color: { argb: "FFFFFFFF" } };
      ws.getRow(rowNum).height = 20;
      rowNum++;
    };

    addSectionHeader("USERS");
    addRow("Total active users", data.users.active);
    addRow("Total inactive users", data.users.inactive);
    addCurrencyRow("Total user account balances", data.users.accountBalances ?? 0);
    addCurrencyRow("Total user investments", data.users.investments ?? 0);
    addTotalRow("TOTAL USER INVESTMENTS PLUS ACCOUNT BALANCES", data.users.investmentsPlusAccountBalances ?? 0);

    addSectionHeader("GROUPS");
    addRow("Investment groups (group leaders)", `${data.groups.investments} (${data.groups.leaders})`);
    addRow("Total group members", data.groups.members);
    addRow("Total corporate groups", data.groups.corporate);

    addSectionHeader("RECOMMENDATIONS");
    addCurrencyRow("Total pending", data.recommendations.pending ?? 0);
    addCurrencyRow("Total approved", data.recommendations.approved ?? 0);
    addRow("Count of approved and pending recommendations", data.recommendations.approvedAndPending);
    addCurrencyRow("Total rejected", data.recommendations.rejected ?? 0);
    addTotalRow("TOTAL RECOMMENDATIONS", data.recommendations.total ?? 0);

    addSectionHeader("INVESTMENTS");
    addCurrencyRow("Average investment amount", data.investments.average ?? 0);
    addRow("Total active investments", data.investments.active);
    addRow("Total active investments over $25K", data.investments.over25K);
    addRow("Total active investments over $50K", data.investments.over50K);
    addRow("Total completed investments", data.investments.completed);
    addTotalRow("TOTAL CATACAP INVESTMENTS, ACTIVE", data.investments.totalActive ?? 0);
    addTotalRow("TOTAL CATACAP INVESTMENTS, COMPLETED", data.investments.totalCompleted ?? 0);
    addTotalRow("TOTAL CATACAP INVESTMENTS, ACTIVE AND CLOSED", data.investments.totalActiveAndClosed ?? 0);
    addTotalRow("TOTAL CATACAP ASSETS (User account balances + total recommendations)", data.investments.assets ?? 0);

    addSectionHeader("INVESTMENTS BY THEME");
    for (const theme of data.investmentThemes) {
      addCurrencyRow(theme.name, theme.total ?? 0);
    }

    addSectionHeader("GRANTS");
    addCurrencyRow("Total pending and in transit grants", data.grants.pendingAndInTransit ?? 0);
    addCurrencyRow("Total pending and in transit other assets", data.grants.pendingAndInTransitOtherAssets ?? 0);

    addSectionHeader("TO BALANCE");
    addBalanceRow("TOTAL RECOMMENDATIONS", data.toBalance.recommendations ?? 0);
    addBalanceRow("TOTAL ACTIVE AND CLOSED CATACAP INVESTMENTS", data.toBalance.activeAndClosed ?? 0);
    addBalanceRow("DIFFERENCE", data.toBalance.difference ?? 0);

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Consolidated Finances.xlsx"'
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Export finances error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
