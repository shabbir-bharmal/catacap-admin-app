import { Router, Request, Response } from "express";
import pool from "../db/pool.js";

const router = Router();

router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const stats = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN LOWER(r.status) = 'approved' THEN r.amount ELSE 0 END), 0) AS total_donations,
        COUNT(CASE WHEN LOWER(r.status) = 'approved' THEN 1 END) AS approved_count,
        COALESCE(SUM(CASE WHEN r.date_created >= $1 THEN r.amount ELSE 0 END), 0) AS this_month_amount,
        COUNT(CASE WHEN r.date_created >= $1 THEN 1 END) AS this_month_count,
        COALESCE(SUM(CASE WHEN r.date_created >= $2 AND r.date_created < $1 THEN r.amount ELSE 0 END), 0) AS last_month_amount,
        COUNT(CASE WHEN r.date_created >= $2 AND r.date_created < $1 THEN 1 END) AS last_month_count
      FROM recommendations r
      JOIN users u ON r.user_email = u.email
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles rl ON ur.role_id = rl.id
      WHERE rl.name = 'User'
    `, [startOfThisMonth, startOfLastMonth]);

    const s = stats.rows[0];
    const totalDonations = parseFloat(s.total_donations);
    const approvedCount = parseInt(s.approved_count);
    const averageDonation = approvedCount === 0 ? 0 : totalDonations / approvedCount;

    const thisMonthAmount = parseFloat(s.this_month_amount);
    const lastMonthAmount = parseFloat(s.last_month_amount);
    const thisMonthCount = parseInt(s.this_month_count);
    const lastMonthCount = parseInt(s.last_month_count);
    const thisMonthAvg = thisMonthCount === 0 ? 0 : thisMonthAmount / thisMonthCount;
    const lastMonthAvg = lastMonthCount === 0 ? 0 : lastMonthAmount / lastMonthCount;

    const groupsResult = await pool.query("SELECT COUNT(*) FROM groups");
    const totalGroups = parseInt(groupsResult.rows[0].count);

    const lastMonthGroupsResult = await pool.query(
      "SELECT COUNT(*) FROM groups WHERE created_at >= $1 AND created_at < $2",
      [startOfLastMonth, startOfThisMonth]
    );
    const lastMonthGroups = parseInt(lastMonthGroupsResult.rows[0].count);

    const usersResult = await pool.query(`
      SELECT COUNT(*) FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'User'
    `);
    const totalUsers = parseInt(usersResult.rows[0].count);

    const lastMonthUsersResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE date_created >= $1 AND date_created < $2",
      [startOfLastMonth, startOfThisMonth]
    );
    const lastMonthUsers = parseInt(lastMonthUsersResult.rows[0].count);

    function calculateGrowth(current: number, previous: number): number {
      if (previous === 0) return current === 0 ? 0 : 100;
      return Math.round(((current - previous) / previous) * 100 * 100) / 100;
    }

    res.json({
      totalDonations: Math.round(totalDonations),
      totalGroups,
      totalUsers,
      averageDonation: Math.round(averageDonation),
      donationGrowthPercentage: calculateGrowth(totalDonations, lastMonthAmount),
      groupGrowthPercentage: calculateGrowth(totalGroups, lastMonthGroups),
      userGrowthPercentage: calculateGrowth(totalUsers, lastMonthUsers),
      avgDonationGrowthPercentage: calculateGrowth(thisMonthAvg, lastMonthAvg),
    });
  } catch (error) {
    console.error("Summary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/investment-chart", async (req: Request, res: Response) => {
  try {
    const months = req.query.months ? parseInt(req.query.months as string) : null;
    const now = new Date();
    let startDate: Date;

    if (months && months > 0) {
      startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    } else {
      const minDate = await pool.query(
        "SELECT MIN(date_created) as min_date FROM recommendations WHERE date_created IS NOT NULL"
      );
      startDate = minDate.rows[0].min_date
        ? new Date(new Date(minDate.rows[0].min_date).getFullYear(), new Date(minDate.rows[0].min_date).getMonth(), 1)
        : new Date(now.getFullYear() - 1, 0, 1);
    }

    const data = await pool.query(`
      SELECT
        EXTRACT(YEAR FROM r.date_created)::int AS year,
        EXTRACT(MONTH FROM r.date_created)::int AS month,
        COALESCE(SUM(r.amount), 0) AS amount
      FROM recommendations r
      JOIN users u ON r.user_email = u.email
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles rl ON ur.role_id = rl.id
      WHERE rl.name = 'User'
        AND LOWER(r.status) = 'approved'
        AND r.date_created >= $1
        AND r.date_created <= $2
      GROUP BY EXTRACT(YEAR FROM r.date_created), EXTRACT(MONTH FROM r.date_created)
    `, [startDate, now]);

    const chartMap = new Map(
      data.rows.map((r: any) => [`${r.year}-${r.month}`, parseFloat(r.amount)])
    );

    const chartData: { month: string; amount: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const loopDate = new Date(startDate);

    while (loopDate <= now) {
      const key = `${loopDate.getFullYear()}-${loopDate.getMonth() + 1}`;
      chartData.push({
        month: monthNames[loopDate.getMonth()],
        amount: Math.round(chartMap.get(key) || 0),
      });
      loopDate.setMonth(loopDate.getMonth() + 1);
    }

    const totalInvestment = data.rows.reduce(
      (sum: number, r: any) => sum + parseFloat(r.amount), 0
    );

    const investorsResult = await pool.query(`
      SELECT COUNT(DISTINCT r.user_email) as count
      FROM recommendations r
      JOIN users u ON r.user_email = u.email
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles rl ON ur.role_id = rl.id
      WHERE rl.name = 'User' AND LOWER(r.status) = 'approved'
        AND r.date_created >= $1 AND r.date_created <= $2
    `, [startDate, now]);

    let growthRate = 0;
    if (months) {
      const previousStart = new Date(startDate);
      previousStart.setMonth(previousStart.getMonth() - months);
      const previousEnd = new Date(startDate);
      previousEnd.setDate(previousEnd.getDate() - 1);

      const prevResult = await pool.query(`
        SELECT COALESCE(SUM(r.amount), 0) as total
        FROM recommendations r
        JOIN users u ON r.user_email = u.email
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN roles rl ON ur.role_id = rl.id
        WHERE rl.name = 'User' AND LOWER(r.status) = 'approved'
          AND r.date_created >= $1 AND r.date_created <= $2
      `, [previousStart, previousEnd]);

      const previousTotal = parseFloat(prevResult.rows[0].total);
      if (previousTotal === 0) growthRate = totalInvestment === 0 ? 0 : 100;
      else growthRate = Math.round(((totalInvestment - previousTotal) / previousTotal) * 100 * 100) / 100;
    }

    res.json({
      totalDonations: Math.round(totalInvestment),
      totalInvestments: Math.round(totalInvestment),
      growthRate,
      investors: parseInt(investorsResult.rows[0].count),
      chartData,
    });
  } catch (error) {
    console.error("Investment chart error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/investment-by-theme", async (_req: Request, res: Response) => {
  try {
    const themes = await pool.query("SELECT id, name FROM themes");
    const campaigns = await pool.query("SELECT id, themes FROM campaigns");

    const campaignThemes = campaigns.rows.map((c: any) => ({
      id: c.id,
      themeIds: c.themes
        ? c.themes.split(",").map((t: string) => parseInt(t.trim())).filter((n: number) => !isNaN(n))
        : [],
    }));

    const recs = await pool.query(`
      SELECT r.campaign_id, r.amount, r.status
      FROM recommendations r
      JOIN users u ON r.user_email = u.email
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles rl ON ur.role_id = rl.id
      WHERE rl.name = 'User'
        AND (LOWER(r.status) = 'pending' OR LOWER(r.status) = 'approved')
    `);

    const recWithThemes = recs.rows.map((r: any) => {
      const ct = campaignThemes.find((c: any) => c.id === r.campaign_id);
      return { amount: parseFloat(r.amount) || 0, status: r.status, themeIds: ct?.themeIds || [] };
    });

    const themeStats = themes.rows.map((theme: any) => {
      const total = recWithThemes.reduce((sum: number, r: any) => {
        if (r.themeIds.includes(theme.id) && r.themeIds.length > 0) {
          return sum + r.amount / r.themeIds.length;
        }
        return sum;
      }, 0);
      return { name: theme.name, total };
    }).filter((t: any) => t.total > 0);

    const grandTotal = themeStats.reduce((sum: number, t: any) => sum + t.total, 0);

    const response = themeStats
      .map((t: any) => ({
        name: t.name,
        totalAmount: Math.round(t.total * 100) / 100,
        percentage: grandTotal === 0 ? 0 : Math.round((t.total / grandTotal) * 100),
      }))
      .sort((a: any, b: any) => b.totalAmount - a.totalAmount);

    res.json(response);
  } catch (error) {
    console.error("Investment by theme error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/recent-investments", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.CurrentPage as string) || 1;
    const pageSize = parseInt(req.query.PerPage as string) || 10;
    const sortField = (req.query.SortField as string) || "date";
    const sortDirection = (req.query.SortDirection as string) || "desc";
    const search = req.query.SearchValue as string;
    const statusFilter = req.query.Status as string;

    const isAsc = sortDirection.toLowerCase() === "asc";

    let whereClause = "WHERE rl.name = 'User'";
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClause += ` AND (
        LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${paramIdx})
        OR LOWER(u.username) LIKE LOWER($${paramIdx})
        OR LOWER(c.name) LIKE LOWER($${paramIdx})
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (statusFilter) {
      whereClause += ` AND r.status = $${paramIdx}`;
      params.push(statusFilter);
      paramIdx++;
    }

    const orderMap: Record<string, string> = {
      investor: "investor",
      investment: "investment",
      amount: "r.amount",
      status: "r.status",
      date: "r.date_created",
    };
    const orderCol = orderMap[sortField.toLowerCase()] || "r.date_created";
    const orderDir = isAsc ? "ASC" : "DESC";

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN campaigns c ON r.campaign_id = c.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles rl ON ur.role_id = rl.id
       ${whereClause}`,
      params
    );

    const dataResult = await pool.query(
      `SELECT
        u.first_name || ' ' || u.last_name AS investor,
        '@' || u.username AS "userName",
        c.name AS investment,
        ROUND(COALESCE(r.amount, 0)) AS amount,
        r.status,
        r.date_created
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN campaigns c ON r.campaign_id = c.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles rl ON ur.role_id = rl.id
       ${whereClause}
       ORDER BY ${orderCol} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    const items = dataResult.rows.map((r: any) => ({
      investor: r.investor,
      userName: r.userName,
      investment: r.investment,
      amount: parseInt(r.amount),
      status: r.status,
      date: r.date_created
        ? new Date(r.date_created).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
        : "",
    }));

    res.json({ totalCount: parseInt(countResult.rows[0].count), items });
  } catch (error) {
    console.error("Recent investments error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/top-donors", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.CurrentPage as string) || 1;
    const pageSize = parseInt(req.query.PerPage as string) || 10;
    const sortField = (req.query.SortField as string) || "donations";
    const sortDirection = (req.query.SortDirection as string) || "desc";
    const search = req.query.SearchValue as string;

    const isAsc = sortDirection.toLowerCase() === "asc";

    let whereClause = "WHERE rl.name = 'User' AND LOWER(r.status) = 'approved'";
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClause += ` AND LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER($${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const orderMap: Record<string, string> = {
      donor: "donor",
      amount: "amount",
      donations: "donations",
    };
    const orderCol = orderMap[sortField.toLowerCase()] || "donations";
    const orderDir = isAsc ? "ASC" : "DESC";

    const result = await pool.query(
      `SELECT
        u.first_name || ' ' || u.last_name AS donor,
        ROUND(COALESCE(SUM(r.amount), 0)) AS amount,
        COUNT(*) AS donations
       FROM recommendations r
       JOIN users u ON r.user_email = u.email
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles rl ON ur.role_id = rl.id
       ${whereClause}
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY ${orderCol} ${orderDir}`,
      params
    );

    const totalCount = result.rows.length;
    const items = result.rows
      .slice((page - 1) * pageSize, page * pageSize)
      .map((r: any) => ({
        donor: r.donor,
        amount: parseInt(r.amount),
        donations: parseInt(r.donations),
      }));

    res.json({ totalCount, items });
  } catch (error) {
    console.error("Top donors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/top-groups", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.CurrentPage as string) || 1;
    const pageSize = parseInt(req.query.PerPage as string) || 10;
    const sortField = (req.query.SortField as string) || "investment";
    const sortDirection = (req.query.SortDirection as string) || "desc";
    const search = req.query.SearchValue as string;

    const isAsc = sortDirection.toLowerCase() === "asc";

    let whereClause = `WHERE rl.name = 'User' AND abl.group_id IS NOT NULL AND (abl.new_value - abl.old_value) > 0`;
    const params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClause += ` AND LOWER(g.name) LIKE LOWER($${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const orderMap: Record<string, string> = {
      group: "group_name",
      investment: "total_investment",
      members: "members",
    };
    const orderCol = orderMap[sortField.toLowerCase()] || "total_investment";
    const orderDir = isAsc ? "ASC" : "DESC";

    const result = await pool.query(
      `SELECT
        g.id AS group_id,
        g.name AS group_name,
        ROUND(COALESCE(SUM(abl.new_value - abl.old_value), 0)) AS total_investment,
        (SELECT COUNT(*) FROM requests req WHERE req.group_id = g.id AND req.status = 'accepted') AS members
       FROM account_balance_change_logs abl
       JOIN groups g ON abl.group_id = g.id
       JOIN users u ON abl.user_id = u.id
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles rl ON ur.role_id = rl.id
       ${whereClause}
       GROUP BY g.id, g.name
       ORDER BY ${orderCol} ${orderDir}`,
      params
    );

    const totalCount = result.rows.length;
    const items = result.rows
      .slice((page - 1) * pageSize, page * pageSize)
      .map((r: any) => ({
        group: r.group_name,
        investment: parseInt(r.total_investment),
        members: parseInt(r.members),
      }));

    res.json({ totalCount, items });
  } catch (error) {
    console.error("Top groups error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.CurrentPage as string) || 1;
    const pageSize = parseInt(req.query.PerPage as string) || 20;
    const sortField = (req.query.SortField as string) || "updatedat";
    const sortDirection = (req.query.SortDirection as string) || "desc";
    const search = req.query.SearchValue as string;
    const id = req.query.id as string;
    const type = req.query.type as string;

    const isAsc = sortDirection.toLowerCase() === "asc";

    let whereClause = "WHERE 1=1";
    const params: any[] = [];
    let paramIdx = 1;

    if (type) {
      whereClause += ` AND LOWER(TRIM(a.table_name)) = LOWER(TRIM($${paramIdx}))`;
      params.push(type);
      paramIdx++;
    }

    if (id) {
      whereClause += ` AND a.record_id = $${paramIdx}`;
      params.push(id);
      paramIdx++;
    }

    if (search) {
      whereClause += ` AND (
        LOWER(a.table_name) LIKE LOWER($${paramIdx})
        OR LOWER(a.action_type) LIKE LOWER($${paramIdx})
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const orderCol = sortField.toLowerCase() === "actiontype" ? "a.action_type" : "a.updated_at";
    const orderDir = isAsc ? "ASC" : "DESC";

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM audit_logs a ${whereClause}`,
      params
    );

    const dataResult = await pool.query(
      `SELECT a.*, u.username as updated_by_name
       FROM audit_logs a
       LEFT JOIN users u ON a.updated_by = u.id
       ${whereClause}
       ORDER BY ${orderCol} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, (page - 1) * pageSize]
    );

    const items = dataResult.rows.map((r: any) => ({
      tableName: r.table_name,
      identifier: r.record_id,
      actionType: r.action_type,
      oldValues: r.old_values,
      newValues: r.new_values,
      changedColumns: r.changed_columns,
      updatedBy: r.updated_by_name,
      updatedAt: r.updated_at
        ? new Date(r.updated_at).toLocaleDateString("en-US", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true,
          })
        : "",
    }));

    res.json({ totalCount: parseInt(countResult.rows[0].count), items });
  } catch (error) {
    console.error("Audit logs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
