import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

const USER_ROLE = "User";

interface PaginationParams {
  currentPage: number;
  perPage: number;
  sortField?: string;
  sortDirection?: string;
  searchValue?: string;
  status?: string;
  id?: string;
  type?: string;
}

function parsePagination(query: Record<string, unknown>): PaginationParams {
  const MAX_PER_PAGE = 100;
  let currentPage = parseInt(String(query.CurrentPage || query.currentPage || "1"), 10);
  let perPage = parseInt(String(query.PerPage || query.perPage || "10"), 10);
  if (isNaN(currentPage) || currentPage < 1) currentPage = 1;
  if (isNaN(perPage) || perPage < 1) perPage = 10;
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE;

  return {
    currentPage,
    perPage,
    sortField: (query.SortField || query.sortField) as string | undefined,
    sortDirection: (query.SortDirection || query.sortDirection) as string | undefined,
    searchValue: (query.SearchValue || query.searchValue) as string | undefined,
    status: (query.Status || query.status) as string | undefined,
    id: query.id as string | undefined,
    type: query.type as string | undefined,
  };
}

function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const recStats = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(TRIM(r.status)) = 'approved' THEN r.amount ELSE 0 END), 0) AS total_approved,
         COUNT(CASE WHEN LOWER(TRIM(r.status)) = 'approved' THEN 1 END) AS approved_count,
         COALESCE(SUM(CASE WHEN r.date_created >= $1 THEN r.amount ELSE 0 END), 0) AS this_month_amount,
         COUNT(CASE WHEN r.date_created >= $1 THEN 1 END) AS this_month_count,
         COALESCE(SUM(CASE WHEN r.date_created >= $2 AND r.date_created < $1 THEN r.amount ELSE 0 END), 0) AS last_month_amount,
         COUNT(CASE WHEN r.date_created >= $2 AND r.date_created < $1 THEN 1 END) AS last_month_count
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE role.name = $3`,
      [startOfThisMonth.toISOString(), startOfLastMonth.toISOString(), USER_ROLE]
    );

    const stats = recStats.rows[0];
    const totalDonations = parseFloat(stats.total_approved) || 0;
    const approvedCount = parseInt(stats.approved_count) || 0;
    const averageDonation = approvedCount === 0 ? 0 : totalDonations / approvedCount;
    const thisMonthDonations = parseFloat(stats.this_month_amount) || 0;
    const lastMonthDonations = parseFloat(stats.last_month_amount) || 0;
    const thisMonthCount = parseInt(stats.this_month_count) || 0;
    const lastMonthCount = parseInt(stats.last_month_count) || 0;

    const groupStats = await pool.query(
      `SELECT 
         COUNT(*) AS total,
         COUNT(CASE WHEN created_at >= $1 AND created_at < $2 THEN 1 END) AS last_month
       FROM groups`,
      [startOfLastMonth.toISOString(), startOfThisMonth.toISOString()]
    );
    const totalGroups = parseInt(groupStats.rows[0].total) || 0;
    const lastMonthGroups = parseInt(groupStats.rows[0].last_month) || 0;

    const userStats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN u.date_created >= $1 AND u.date_created < $2 THEN 1 END) AS last_month
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE role.name = $3`,
      [startOfLastMonth.toISOString(), startOfThisMonth.toISOString(), USER_ROLE]
    );
    const totalUsers = parseInt(userStats.rows[0].total) || 0;
    const lastMonthUsers = parseInt(userStats.rows[0].last_month) || 0;

    const thisMonthAvg = thisMonthCount === 0 ? 0 : thisMonthDonations / thisMonthCount;
    const lastMonthAvg = lastMonthCount === 0 ? 0 : lastMonthDonations / lastMonthCount;

    const thisMonthGroupResult = await pool.query(
      `SELECT COUNT(*) AS total FROM groups WHERE created_at >= $1`,
      [startOfThisMonth.toISOString()]
    );
    const thisMonthGroups = parseInt(thisMonthGroupResult.rows[0].total) || 0;

    const thisMonthUserResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE role.name = $1 AND u.date_created >= $2`,
      [USER_ROLE, startOfThisMonth.toISOString()]
    );
    const thisMonthUsers = parseInt(thisMonthUserResult.rows[0].total) || 0;

    res.json({
      totalDonations: Math.round(totalDonations),
      totalGroups,
      totalUsers,
      averageDonation: Math.round(averageDonation),
      donationGrowthPercentage: calculateGrowth(thisMonthDonations, lastMonthDonations),
      groupGrowthPercentage: calculateGrowth(thisMonthGroups, lastMonthGroups),
      userGrowthPercentage: calculateGrowth(thisMonthUsers, lastMonthUsers),
      avgDonationGrowthPercentage: calculateGrowth(thisMonthAvg, lastMonthAvg),
    });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/investment-chart", async (req: Request, res: Response) => {
  try {
    const months = req.query.months ? parseInt(String(req.query.months), 10) : null;
    const now = new Date();

    let startDate: Date;
    if (months && months > 0) {
      startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    } else {
      const minResult = await pool.query(
        `SELECT MIN(date_created) AS min_date FROM recommendations WHERE date_created IS NOT NULL`
      );
      const minDate = minResult.rows[0]?.min_date;
      if (minDate) {
        const d = new Date(minDate);
        startDate = new Date(d.getFullYear(), d.getMonth(), 1);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }

    const dataResult = await pool.query(
      `SELECT r.amount, r.date_created, r.user_email
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE role.name = $1
         AND LOWER(TRIM(r.status)) = 'approved'
         AND r.date_created IS NOT NULL
         AND r.date_created >= $2
         AND r.date_created <= $3`,
      [USER_ROLE, startDate.toISOString(), now.toISOString()]
    );

    const data = dataResult.rows;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const monthlyMap = new Map<string, number>();
    const investorEmails = new Set<string>();

    for (const row of data) {
      const d = new Date(row.date_created);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + (parseFloat(row.amount) || 0));
      if (row.user_email) investorEmails.add(row.user_email);
    }

    const chartData: Array<{ month: string; amount: number }> = [];
    const loopDate = new Date(startDate);
    while (loopDate <= now) {
      const key = `${loopDate.getFullYear()}-${loopDate.getMonth()}`;
      chartData.push({
        month: monthNames[loopDate.getMonth()],
        amount: Math.round(monthlyMap.get(key) || 0),
      });
      loopDate.setMonth(loopDate.getMonth() + 1);
    }

    const totalInvestment = data.reduce((sum: number, r: { amount: string }) => sum + (parseFloat(r.amount) || 0), 0);

    let growthRate = 0;
    if (months && months > 0) {
      const previousStart = new Date(startDate);
      previousStart.setMonth(previousStart.getMonth() - months);
      const previousEnd = new Date(startDate);
      previousEnd.setDate(previousEnd.getDate() - 1);

      const prevResult = await pool.query(
        `SELECT COALESCE(SUM(r.amount), 0) AS total
         FROM recommendations r
         JOIN users u ON r.user_email = u.email
         JOIN user_roles ur ON u.id = ur.user_id
         JOIN roles role ON ur.role_id = role.id
         WHERE role.name = $1
           AND LOWER(TRIM(r.status)) = 'approved'
           AND r.date_created >= $2
           AND r.date_created <= $3`,
        [USER_ROLE, previousStart.toISOString(), previousEnd.toISOString()]
      );
      const previousTotal = parseFloat(prevResult.rows[0].total) || 0;
      growthRate = calculateGrowth(totalInvestment, previousTotal);
    }

    res.json({
      totalDonations: Math.round(totalInvestment),
      totalInvestments: Math.round(totalInvestment),
      growthRate,
      investors: investorEmails.size,
      chartData,
    });
  } catch (err) {
    console.error("Investment chart error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/investment-by-theme", async (_req: Request, res: Response) => {
  try {
    const themes = await pool.query(`SELECT id, name FROM themes`);

    const campaigns = await pool.query(`SELECT id, themes FROM campaigns`);

    const campaignThemes = campaigns.rows.map((c: { id: number; themes: string | null }) => ({
      id: c.id,
      themeIds: c.themes
        ? c.themes.split(",").map((t: string) => parseInt(t.trim(), 10)).filter((n: number) => !isNaN(n))
        : [],
    }));

    const recResult = await pool.query(
      `SELECT r.campaign_id, r.amount, r.status
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE role.name = $1
         AND (LOWER(TRIM(r.status)) = 'pending' OR LOWER(TRIM(r.status)) = 'approved')`,
      [USER_ROLE]
    );

    const campaignThemeMap = new Map<number, number[]>();
    for (const ct of campaignThemes) {
      campaignThemeMap.set(Number(ct.id), ct.themeIds);
    }

    const themeStats = new Map<number, { name: string; total: number }>();
    for (const theme of themes.rows) {
      themeStats.set(Number(theme.id), { name: theme.name, total: 0 });
    }

    for (const rec of recResult.rows) {
      const themeIds = campaignThemeMap.get(Number(rec.campaign_id)) || [];
      if (themeIds.length === 0) continue;
      const splitAmount = (parseFloat(rec.amount) || 0) / themeIds.length;
      for (const themeId of themeIds) {
        const stat = themeStats.get(themeId);
        if (stat) {
          stat.total += splitAmount;
        }
      }
    }

    const results = Array.from(themeStats.values())
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    const grandTotal = results.reduce((sum, s) => sum + s.total, 0);

    const response = results.map((s) => ({
      name: s.name,
      totalAmount: Math.round(s.total * 100) / 100,
      percentage: grandTotal === 0 ? 0 : Math.round((s.total / grandTotal) * 100),
    }));

    res.json(response);
  } catch (err) {
    console.error("Investment by theme error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/recent-investments", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const sortColumns: Record<string, string> = {
      investor: "investor",
      investment: "investment",
      amount: "r.amount",
      status: "r.status",
      date: "r.date_created",
    };
    const orderBy = sortColumns[params.sortField?.toLowerCase() || ""] || "r.date_created";
    const orderDir = isAsc ? "ASC" : "DESC";

    const conditions: string[] = [`role.name = $1`];
    const values: (string | number)[] = [USER_ROLE];
    let paramIdx = 2;

    if (params.searchValue) {
      conditions.push(
        `(LOWER(u.first_name || ' ' || u.last_name) LIKE $${paramIdx} OR LOWER(u.user_name) LIKE $${paramIdx} OR LOWER(c.name) LIKE $${paramIdx})`
      );
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    if (params.status) {
      conditions.push(`r.status = $${paramIdx}`);
      values.push(params.status);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN campaigns c ON r.campaign_id = c.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT
         u.first_name || ' ' || u.last_name AS investor,
         '@' || u.user_name AS "userName",
         c.name AS investment,
         COALESCE(r.amount, 0) AS amount,
         r.status,
         r.date_created
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN campaigns c ON r.campaign_id = c.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE ${whereClause}
       ORDER BY ${orderBy} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((row: { investor: string; userName: string; investment: string; amount: string; status: string; date_created: string }) => {
      const d = row.date_created ? new Date(row.date_created) : null;
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        investor: row.investor,
        userName: row.userName,
        investment: row.investment,
        amount: Math.round(parseFloat(row.amount) || 0),
        status: row.status,
        date: d ? `${monthNames[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}` : "",
      };
    });

    res.json({
      totalCount: parseInt(countResult.rows[0].total) || 0,
      items,
    });
  } catch (err) {
    console.error("Recent investments error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/top-donors", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const sortColumns: Record<string, string> = {
      donor: "donor",
      amount: "amount",
      donations: "donations",
    };
    const orderBy = sortColumns[params.sortField?.toLowerCase() || ""] || "donations";
    const orderDir = isAsc ? "ASC" : "DESC";

    const conditions: string[] = [`role.name = $1`, `LOWER(TRIM(r.status)) = 'approved'`];
    const values: (string | number)[] = [USER_ROLE];
    let paramIdx = 2;

    if (params.searchValue) {
      conditions.push(`LOWER(u.first_name || ' ' || u.last_name) LIKE $${paramIdx}`);
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT
         u.first_name || ' ' || u.last_name AS donor,
         COALESCE(SUM(r.amount), 0) AS amount,
         COUNT(*) AS donations
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE ${whereClause}
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY ${orderBy} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((row: { donor: string; amount: string; donations: string }) => ({
      donor: row.donor,
      amount: Math.round(parseFloat(row.amount) || 0),
      donations: parseInt(row.donations) || 0,
    }));

    res.json({
      totalCount: parseInt(countResult.rows[0].total) || 0,
      items,
    });
  } catch (err) {
    console.error("Top donors error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/top-groups", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const sortColumns: Record<string, string> = {
      group: "group_name",
      investment: "total_investment",
      members: "members",
    };
    const orderBy = sortColumns[params.sortField?.toLowerCase() || ""] || "total_investment";
    const orderDir = isAsc ? "ASC" : "DESC";

    const conditions: string[] = [
      `role.name = $1`,
      `log.group_id IS NOT NULL`,
      `(log.new_value - log.old_value) > 0`,
    ];
    const values: (string | number)[] = [USER_ROLE];
    let paramIdx = 2;

    if (params.searchValue) {
      conditions.push(`LOWER(g.name) LIKE $${paramIdx}`);
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT g.id) AS total
       FROM groups g
       JOIN account_balance_change_logs log ON g.id = log.group_id
       JOIN users u ON log.user_id = u.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT
         g.id AS group_id,
         g.name AS group_name,
         COALESCE(SUM(log.new_value - log.old_value), 0) AS total_investment,
         (SELECT COUNT(*) FROM requests req WHERE req.group_to_follow_id = g.id AND req.status = 'accepted') AS members
       FROM groups g
       JOIN account_balance_change_logs log ON g.id = log.group_id
       JOIN users u ON log.user_id = u.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles role ON ur.role_id = role.id
       WHERE ${whereClause}
       GROUP BY g.id, g.name
       ORDER BY ${orderBy} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((row: { group_name: string; total_investment: string; members: string }) => ({
      group: row.group_name,
      investment: Math.round(parseFloat(row.total_investment) || 0),
      members: parseInt(row.members) || 0,
    }));

    res.json({
      totalCount: parseInt(countResult.rows[0].total) || 0,
      items,
    });
  } catch (err) {
    console.error("Top groups error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIdx = 1;

    if (params.type) {
      const typeAliases: Record<string, string[]> = {
        users: ["users", "aspnetusers"],
        aspnetusers: ["users", "aspnetusers"],
        campaigns: ["campaigns"],
        groups: ["groups"],
      };
      const normalizedType = (params.type as string).toLowerCase().trim();
      const aliases = typeAliases[normalizedType] || [normalizedType];
      const placeholders = aliases.map((_, i) => `$${paramIdx + i}`);
      conditions.push(`LOWER(TRIM(a.table_name)) IN (${placeholders.join(", ")})`);
      for (const alias of aliases) {
        values.push(alias);
        paramIdx++;
      }
    }

    if (params.id) {
      conditions.push(`a.record_id = $${paramIdx}`);
      values.push(params.id);
      paramIdx++;
    }

    if (params.searchValue) {
      conditions.push(
        `(LOWER(a.table_name) LIKE $${paramIdx} OR LOWER(a.action_type) LIKE $${paramIdx})`
      );
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortColumns: Record<string, string> = {
      actiontype: "a.action_type",
      updatedat: "a.updated_at",
    };
    const orderBy = sortColumns[params.sortField?.toLowerCase() || ""] || "a.updated_at";
    const orderDir = isAsc ? "ASC" : "DESC";

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs a ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT
         a.table_name AS "tableName",
         a.record_id,
         CASE
           WHEN a.table_name IN ('AspNetUsers', 'users') THEN COALESCE(usr.first_name || ' ' || usr.last_name, a.record_id)
           WHEN a.table_name IN ('Campaigns', 'campaigns') THEN COALESCE(camp.name, a.record_id)
           WHEN a.table_name IN ('Groups', 'groups') THEN COALESCE(grp.name, a.record_id)
           ELSE a.record_id
         END AS identifier,
         a.action_type AS "actionType",
         a.old_values AS "oldValues",
         a.new_values AS "newValues",
         a.changed_columns AS "changedColumns",
         upd.user_name AS "updatedBy",
         TO_CHAR(a.updated_at, 'DD Mon YYYY HH12:MI AM') AS "updatedAt"
       FROM audit_logs a
       LEFT JOIN users upd ON a.updated_by = upd.id
       LEFT JOIN users usr ON a.record_id = usr.id AND a.table_name IN ('AspNetUsers', 'users')
       LEFT JOIN campaigns camp ON a.record_id = camp.id::text AND a.table_name IN ('Campaigns', 'campaigns')
       LEFT JOIN groups grp ON a.record_id = grp.id::text AND a.table_name IN ('Groups', 'groups')
       ${whereClause}
       ORDER BY ${orderBy} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((item: any) => ({
      ...item,
      oldValues: formatJsonDates(item.oldValues),
      newValues: formatJsonDates(item.newValues),
    }));

    res.json({
      totalCount: parseInt(countResult.rows[0].total) || 0,
      items,
    });
  } catch (err) {
    console.error("Audit logs error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

function formatJsonDates(json: string | null): string | null {
  if (!json) return json;
  try {
    const dict = JSON.parse(json);
    if (!dict || typeof dict !== "object") return json;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for (const key of Object.keys(dict)) {
      const val = dict[key];
      if (typeof val !== "string" || val.length < 8 || val.length > 40) continue;
      if (/^\d+$/.test(val.trim())) continue;
      const d = new Date(val);
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() < 1900 || d.getFullYear() > 2100) continue;
      const day = String(d.getDate()).padStart(2, "0");
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      const mins = String(d.getMinutes()).padStart(2, "0");
      dict[key] = `${day} ${month} ${year} ${String(hours).padStart(2, "0")}:${mins} ${ampm}`;
    }
    return JSON.stringify(dict);
  } catch {
    return json;
  }
}

export default router;
