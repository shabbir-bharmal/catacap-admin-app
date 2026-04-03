import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination } from "../utils/softDelete.js";
import ExcelJS from "exceljs";

const router = Router();

const InvestmentStageDescriptions: Record<number, string> = {
  1: "Private",
  2: "Public",
  3: "Closed - Invested",
  4: "Closed - Not Invested",
  5: "New",
  6: "Compliance Review",
  7: "Completed - Ongoing",
  8: "Vetting",
  9: "Completed - Ongoing/Private",
};

function getStageDescription(stage: number | null): string {
  if (stage === null || stage === undefined) return "";
  return InvestmentStageDescriptions[stage] || String(stage);
}

function parseCommaSeparatedIds(input: string | null | undefined): number[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

function formatDateMMDDYYYY(dateVal: any): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatAmount(amount: any): string {
  const num = parseFloat(amount) || 0;
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const themesIdRaw = (req.query.ThemesId || req.query.themesId) as string | undefined;
    const investmentTypeIdRaw = (req.query.InvestmentTypeId || req.query.investmentTypeId) as string | undefined;
    const selectedThemeIds = parseCommaSeparatedIds(themesIdRaw);
    const selectedInvestmentTypeIds = parseCommaSeparatedIds(investmentTypeIdRaw);

    const themesResult = await pool.query(`SELECT id, name FROM themes WHERE (is_deleted IS NULL OR is_deleted = false)`);
    const themes = themesResult.rows;
    const themeMap: Record<number, string> = {};
    for (const t of themes) themeMap[t.id] = t.name;

    const invTypesResult = await pool.query(`SELECT id, name FROM investment_types`);
    const investmentTypes = invTypesResult.rows;
    const invTypeMap: Record<number, string> = {};
    for (const t of investmentTypes) invTypeMap[t.id] = t.name;

    const conditions: string[] = [];
    if (params.isDeleted === true) {
      conditions.push(`cid.is_deleted = true`);
    } else {
      conditions.push(`(cid.is_deleted IS NULL OR cid.is_deleted = false)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const detailsResult = await pool.query(`
      SELECT cid.id, cid.date_of_last_investment, cid.campaign_id, cid.investment_detail,
             cid.amount, cid.type_of_investment, cid.donors, cid.themes AS cid_themes,
             cid.created_on, cid.site_configuration_id, cid.investment_vehicle,
             cid.deleted_at, cid.is_deleted,
             c.name AS campaign_name, c.tile_image_file_name, c.description AS campaign_description,
             c.target, c.stage, c.property, c.themes AS campaign_themes, c.associated_fund_id,
             c.id AS c_id, c.added_total_admin_raised, c.investment_types AS campaign_investment_types,
             sc.id AS sc_id,
             du.first_name AS deleted_by_first_name, du.last_name AS deleted_by_last_name
      FROM completed_investment_details cid
      LEFT JOIN campaigns c ON cid.campaign_id = c.id
      LEFT JOIN site_configurations sc ON cid.site_configuration_id = sc.id
      LEFT JOIN users du ON cid.deleted_by = du.id
      ${whereClause}
    `);

    const completedDetails = detailsResult.rows;

    const notesResult = await pool.query(`
      SELECT DISTINCT completed_investment_id FROM completed_investment_notes WHERE completed_investment_id IS NOT NULL
    `);
    const completedNoteIds = new Set(notesResult.rows.map((r: any) => r.completed_investment_id));

    const userRoleResult = await pool.query(`
      SELECT u.email FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'User'
    `);
    const userEmails = userRoleResult.rows.map((r: any) => r.email);

    let totalInvestors = completedDetails.reduce((sum: number, r: any) => sum + (parseInt(r.donors) || 0), 0);

    let totalInvestmentAmount = 0;
    if (userEmails.length > 0) {
      const emailPlaceholders = userEmails.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const recAmountResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM recommendations
         WHERE user_email IN (${emailPlaceholders})
           AND (LOWER(status) = 'approved' OR LOWER(status) = 'pending')
           AND amount > 0
           AND user_email IS NOT NULL AND TRIM(user_email) != ''`,
        userEmails
      );
      totalInvestmentAmount = parseFloat(recAmountResult.rows[0]?.total) || 0;
    }

    const completedCount = completedDetails.length;

    const datesWithValues = completedDetails
      .filter((r: any) => r.date_of_last_investment)
      .map((r: any) => new Date(r.date_of_last_investment))
      .filter((d: Date) => !isNaN(d.getTime()));
    datesWithValues.sort((a: Date, b: Date) => b.getTime() - a.getTime());
    const lastCompletedDate = datesWithValues.length > 0 ? formatDateMMDDYYYY(datesWithValues[0]) : "";

    const campaignIds = completedDetails
      .map((r: any) => r.campaign_id)
      .filter((id: any) => id !== null && id !== undefined);
    const uniqueCampaignIds = [...new Set(campaignIds)] as number[];

    let recStats: Record<number, { currentBalance: number; numberOfInvestors: number }> = {};
    let avatarLookup: Record<number, string[]> = {};

    if (uniqueCampaignIds.length > 0 && userEmails.length > 0) {
      const campPlaceholders = uniqueCampaignIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const emailOffset = uniqueCampaignIds.length;
      const emailPlaceholders2 = userEmails.map((_: any, i: number) => `$${i + 1 + emailOffset}`).join(", ");

      const recStatsResult = await pool.query(
        `SELECT campaign_id, COALESCE(SUM(amount), 0) AS current_balance,
                COUNT(DISTINCT LOWER(user_email)) AS number_of_investors
         FROM recommendations
         WHERE campaign_id IN (${campPlaceholders})
           AND user_email IN (${emailPlaceholders2})
           AND (status = 'approved' OR status = 'pending')
           AND amount > 0
           AND user_email IS NOT NULL
         GROUP BY campaign_id`,
        [...uniqueCampaignIds, ...userEmails]
      );
      for (const row of recStatsResult.rows) {
        recStats[row.campaign_id] = {
          currentBalance: parseFloat(row.current_balance) || 0,
          numberOfInvestors: parseInt(row.number_of_investors) || 0,
        };
      }

      const avatarResult = await pool.query(
        `SELECT r.campaign_id, u.picture_file_name, r.id AS rec_id
         FROM recommendations r
         JOIN users u ON r.user_email = u.email
         WHERE r.campaign_id IN (${campPlaceholders})
           AND (r.status = 'approved' OR r.status = 'pending')
           AND u.picture_file_name IS NOT NULL
           AND u.consent_to_show_avatar = true`,
        uniqueCampaignIds
      );

      const avatarGroups: Record<number, any[]> = {};
      for (const row of avatarResult.rows) {
        if (!avatarGroups[row.campaign_id]) avatarGroups[row.campaign_id] = [];
        avatarGroups[row.campaign_id].push(row);
      }
      for (const [campId, rows] of Object.entries(avatarGroups)) {
        rows.sort((a: any, b: any) => b.rec_id - a.rec_id);
        const seen = new Set<string>();
        const pics: string[] = [];
        for (const r of rows) {
          if (!seen.has(r.picture_file_name)) {
            seen.add(r.picture_file_name);
            pics.push(r.picture_file_name);
            if (pics.length >= 3) break;
          }
        }
        avatarLookup[parseInt(campId)] = pics;
      }
    }

    const fundIds = completedDetails
      .map((r: any) => r.associated_fund_id)
      .filter((id: any) => id !== null && id !== undefined);
    const uniqueFundIds = [...new Set(fundIds)] as number[];
    let fundNameMap: Record<number, string> = {};
    if (uniqueFundIds.length > 0) {
      const fundPlaceholders = uniqueFundIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const fundResult = await pool.query(
        `SELECT id, name FROM campaigns WHERE id IN (${fundPlaceholders})`,
        uniqueFundIds
      );
      for (const row of fundResult.rows) {
        fundNameMap[row.id] = row.name;
      }
    }

    let approvedAmounts: Record<number, number> = {};
    if (uniqueCampaignIds.length > 0) {
      const campPlaceholders = uniqueCampaignIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const approvedResult = await pool.query(
        `SELECT campaign_id, COALESCE(SUM(amount), 0) AS total
         FROM recommendations
         WHERE campaign_id IN (${campPlaceholders})
           AND LOWER(status) = 'approved'
           AND amount > 0
         GROUP BY campaign_id`,
        uniqueCampaignIds
      );
      for (const row of approvedResult.rows) {
        approvedAmounts[row.campaign_id] = parseFloat(row.total) || 0;
      }
    }

    let completedInvestmentsHistory = completedDetails.map((x: any) => {
      const campaignThemeIds = parseCommaSeparatedIds(x.campaign_themes);
      const invTypeIds = parseCommaSeparatedIds(x.type_of_investment);

      const themeNames = campaignThemeIds
        .map((id) => themeMap[id])
        .filter(Boolean)
        .sort()
        .join(", ");

      const investmentTypesNames = invTypeIds
        .map((id) => invTypeMap[id])
        .filter(Boolean)
        .sort()
        .join(", ");

      const dto: any = {
        id: Number(x.id),
        dateOfLastInvestment: x.date_of_last_investment,
        name: x.campaign_name,
        cataCapFund: x.associated_fund_id ? (fundNameMap[x.associated_fund_id] || null) : null,
        tileImageFileName: x.tile_image_file_name,
        description: x.campaign_description,
        target: x.target,
        investmentDetail: x.investment_detail,
        transactionType: x.sc_id != null ? Number(x.sc_id) : null,
        stage: getStageDescription(x.stage),
        totalInvestmentAmount: Math.round(parseFloat(x.amount) || 0),
        typeOfInvestment: investmentTypesNames,
        donors: x.donors,
        property: x.property,
        themes: themeNames,
        investmentVehicle: x.investment_vehicle,
        hasNotes: completedNoteIds.has(x.id),
        approvedRecommendationsAmount: approvedAmounts[x.campaign_id] || 0,
        latestInvestorAvatars: avatarLookup[x.campaign_id] || [],
        deletedAt: x.deleted_at,
        deletedBy: x.deleted_by_first_name
          ? `${x.deleted_by_first_name} ${x.deleted_by_last_name || ""}`.trim()
          : null,
      };

      const stats = recStats[x.campaign_id];
      if (stats) {
        dto.currentBalance = stats.currentBalance + (parseInt(x.added_total_admin_raised) || 0);
        dto.numberOfInvestors = stats.numberOfInvestors;
      }

      return {
        createdOn: x.created_on,
        themeIds: campaignThemeIds,
        investmentTypeIds: invTypeIds,
        dto,
      };
    });

    completedInvestmentsHistory = completedInvestmentsHistory.filter((x: any) => {
      if (selectedThemeIds.length > 0 && !x.themeIds.some((id: number) => selectedThemeIds.includes(id))) {
        return false;
      }
      if (selectedInvestmentTypeIds.length > 0 && !x.investmentTypeIds.some((id: number) => selectedInvestmentTypeIds.includes(id))) {
        return false;
      }
      if (params.searchValue) {
        const sv = params.searchValue.toLowerCase();
        const nameMatch = x.dto.name && x.dto.name.toLowerCase().includes(sv);
        const detailMatch = x.dto.investmentDetail && x.dto.investmentDetail.toLowerCase().includes(sv);
        if (!nameMatch && !detailMatch) return false;
      }
      return true;
    });

    const isAsc = (params.sortDirection || "").toLowerCase() === "asc";
    const sortField = (params.sortField || "").toLowerCase();

    completedInvestmentsHistory.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortField) {
        case "dateoflastinvestment":
          cmp = new Date(a.dto.dateOfLastInvestment || 0).getTime() - new Date(b.dto.dateOfLastInvestment || 0).getTime();
          break;
        case "fund":
          cmp = (a.dto.cataCapFund || "").localeCompare(b.dto.cataCapFund || "");
          break;
        case "investmentname":
          cmp = (a.dto.name || "").localeCompare(b.dto.name || "");
          break;
        case "investmentdetail":
          cmp = (a.dto.investmentDetail || "").localeCompare(b.dto.investmentDetail || "");
          break;
        case "totalinvestmentamount":
          cmp = (a.dto.totalInvestmentAmount || 0) - (b.dto.totalInvestmentAmount || 0);
          break;
        case "donors":
          cmp = (a.dto.donors || 0) - (b.dto.donors || 0);
          break;
        case "typeofinvestment":
          cmp = (a.dto.typeOfInvestment || "").localeCompare(b.dto.typeOfInvestment || "");
          break;
        case "themes":
          cmp = (a.dto.themes || "").localeCompare(b.dto.themes || "");
          break;
        default: {
          cmp = new Date(b.createdOn || 0).getTime() - new Date(a.createdOn || 0).getTime();
          if (cmp === 0) cmp = (a.dto.name || "").localeCompare(b.dto.name || "");
          return cmp;
        }
      }
      return isAsc ? cmp : -cmp;
    });

    const totalCountFiltered = completedInvestmentsHistory.length;

    const currentPage = params.currentPage;
    const perPage = params.perPage;
    const hasPagination = currentPage > 0 && perPage > 0;

    let items;
    if (hasPagination) {
      items = completedInvestmentsHistory
        .slice((currentPage - 1) * perPage, currentPage * perPage)
        .map((x: any) => x.dto);
    } else {
      items = completedInvestmentsHistory.map((x: any) => x.dto);
    }

    const response: any = {
      totalCount: totalCountFiltered,
      items,
      completedInvestments: completedCount,
      totalInvestmentAmount: Math.round(totalInvestmentAmount),
      totalInvestors,
      lastCompletedInvestmentsDate: lastCompletedDate,
    };

    if (totalCountFiltered === 0) {
      response.message = "No records found for completed investments.";
    }

    res.json(response);
  } catch (err: any) {
    console.error("Error fetching completed investments:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const themesResult = await pool.query(`SELECT id, name FROM themes WHERE (is_deleted IS NULL OR is_deleted = false)`);
    const themeMap: Record<number, string> = {};
    for (const t of themesResult.rows) themeMap[t.id] = t.name;

    const invTypesResult = await pool.query(`SELECT id, name FROM investment_types`);
    const invTypeMap: Record<number, string> = {};
    for (const t of invTypesResult.rows) invTypeMap[t.id] = t.name;

    const result = await pool.query(`
      SELECT cid.date_of_last_investment, cid.investment_detail, cid.amount,
             cid.type_of_investment, cid.donors, cid.investment_vehicle, cid.created_on,
             c.name AS campaign_name, c.stage, c.themes AS campaign_themes, c.associated_fund_id,
             sc.value AS transaction_type_value
      FROM completed_investment_details cid
      LEFT JOIN campaigns c ON cid.campaign_id = c.id
      LEFT JOIN site_configurations sc ON cid.site_configuration_id = sc.id
      WHERE (cid.is_deleted IS NULL OR cid.is_deleted = false)
      ORDER BY cid.created_on DESC, c.name ASC
    `);

    const rows = result.rows;

    const fundIds = rows.map((r: any) => r.associated_fund_id).filter((id: any) => id !== null && id !== undefined);
    const uniqueFundIds = [...new Set(fundIds)] as number[];
    let fundNameMap: Record<number, string> = {};
    if (uniqueFundIds.length > 0) {
      const fundPlaceholders = uniqueFundIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const fundResult = await pool.query(
        `SELECT id, name FROM campaigns WHERE id IN (${fundPlaceholders})`,
        uniqueFundIds
      );
      for (const row of fundResult.rows) {
        fundNameMap[row.id] = row.name;
      }
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Returns");

    const headers = [
      "Date Of Last Investment", "CataCap Investment", "Stage", "CataCap Fund",
      "Investment Detail", "Amount", "Transaction Type", "Type Of Investment",
      "Donors", "Investment Vehicle", "Themes",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const row of rows) {
      const campaignThemeIds = parseCommaSeparatedIds(row.campaign_themes);
      const themeNames = campaignThemeIds.map((id) => themeMap[id]).filter(Boolean).join(", ");

      const invTypeIds = parseCommaSeparatedIds(row.type_of_investment);
      const investmentTypesNames = invTypeIds.map((id) => invTypeMap[id]).filter(Boolean).join(", ");

      worksheet.addRow([
        row.date_of_last_investment || "",
        row.campaign_name || "",
        getStageDescription(row.stage),
        row.associated_fund_id ? (fundNameMap[row.associated_fund_id] || "") : "",
        row.investment_detail || "",
        formatAmount(row.amount),
        row.transaction_type_value || "",
        investmentTypesNames,
        row.donors || 0,
        row.investment_vehicle || "",
        themeNames,
      ]);
    }

    const amountColIndex = 6;
    worksheet.getColumn(amountColIndex).alignment = { horizontal: "right" };

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 10;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=CompletedInvestmentsDetails.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting completed investments:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/details", async (req: Request, res: Response) => {
  try {
    const investmentId = parseInt(String(req.query.investmentId || req.query.InvestmentId || "0"), 10);

    if (investmentId <= 0) {
      res.json({ success: false, message: "InvestmentId is required." });
      return;
    }

    const campaignResult = await pool.query(`SELECT id, investment_types FROM campaigns WHERE id = $1`, [investmentId]);
    const campaign = campaignResult.rows[0];

    const recResult = await pool.query(
      `SELECT id, status, amount, date_created
       FROM recommendations
       WHERE campaign_id = $1
         AND (LOWER(status) = 'approved' OR LOWER(status) = 'pending')
         AND amount > 0
         AND user_email IS NOT NULL AND TRIM(user_email) != ''
       ORDER BY id DESC`,
      [investmentId]
    );

    const recs = recResult.rows;

    const totalApprovedAmount = recs
      .filter((r: any) => r.status?.toLowerCase() === "approved")
      .reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0);

    const totalPendingAmount = recs
      .filter((r: any) => r.status?.toLowerCase() === "pending")
      .reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0);

    const lastInvestmentDate = recs.length > 0
      ? recs[0]?.date_created || null
      : null;

    const investmentVehicle = req.query.InvestmentVehicle || req.query.investmentVehicle || null;

    res.json({
      dateOfLastInvestment: lastInvestmentDate,
      typeOfInvestmentIds: campaign?.investment_types || null,
      approvedRecommendationsAmount: totalApprovedAmount,
      pendingRecommendationsAmount: totalPendingAmount,
      investmentVehicle,
    });
  } catch (err: any) {
    console.error("Error fetching completed investment details:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      investmentId, investmentDetail, totalInvestmentAmount, transactionTypeId,
      dateOfLastInvestment, typeOfInvestmentIds, typeOfInvestmentName, note, investmentVehicle, id,
    } = req.body;

    if (!investmentId || investmentId <= 0) {
      res.json({ success: false, message: "InvestmentId is required." });
      return;
    }
    if (!totalInvestmentAmount || totalInvestmentAmount <= 0) {
      res.json({ success: false, message: "Amount must be greater than zero." });
      return;
    }
    if (!investmentDetail) {
      res.json({ success: false, message: "Investment detail is required." });
      return;
    }
    if (!dateOfLastInvestment) {
      res.json({ success: false, message: "Last investment date is required." });
      return;
    }

    const loginUserId = req.user?.id;

    let investmentTypeIdsList = typeOfInvestmentIds
      ? typeOfInvestmentIds.split(",").map((s: string) => s.trim()).filter((s: string) => s !== "-1" && s !== "")
      : [];

    if (typeOfInvestmentIds && typeOfInvestmentName && typeOfInvestmentIds.split(",").some((s: string) => s.trim() === "-1")) {
      const newTypeResult = await pool.query(
        `INSERT INTO investment_types (name) VALUES ($1) RETURNING id`,
        [typeOfInvestmentName.trim()]
      );
      investmentTypeIdsList.push(String(newTypeResult.rows[0].id));
    }

    const updatedTypeIds = investmentTypeIdsList.join(",");

    const campaignResult = await pool.query(`SELECT id, themes FROM campaigns WHERE id = $1`, [investmentId]);
    const campaign = campaignResult.rows[0];

    const recResult = await pool.query(
      `SELECT DISTINCT user_email FROM recommendations
       WHERE campaign_id = $1
         AND (LOWER(status) = 'approved' OR LOWER(status) = 'pending')
         AND amount > 0
         AND user_email IS NOT NULL AND TRIM(user_email) != ''`,
      [investmentId]
    );
    const totalInvestors = recResult.rows.length;

    if (!id || id === 0) {
      const insertResult = await pool.query(
        `INSERT INTO completed_investment_details
          (campaign_id, investment_detail, amount, date_of_last_investment, type_of_investment,
           site_configuration_id, donors, themes, investment_vehicle, created_by, created_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING id`,
        [
          investmentId,
          investmentDetail,
          totalInvestmentAmount,
          dateOfLastInvestment,
          updatedTypeIds,
          transactionTypeId || null,
          totalInvestors,
          campaign?.themes || null,
          investmentVehicle || null,
          loginUserId,
        ]
      );

      const entityId = insertResult.rows[0].id;

      if (note && note.trim()) {
        await pool.query(
          `INSERT INTO completed_investment_notes
            (completed_investment_id, note, created_by, created_at, old_amount, new_amount, transaction_type)
           VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
          [entityId, note, loginUserId, 0, totalInvestmentAmount || 0, transactionTypeId || null]
        );
      }

      res.json({ success: true, message: "Investment details saved successfully." });
      return;
    }

    const existingResult = await pool.query(
      `SELECT id, amount FROM completed_investment_details WHERE id = $1`,
      [id]
    );

    if (existingResult.rows.length === 0) {
      res.json({ success: false, message: "Record not found." });
      return;
    }

    const oldAmount = parseFloat(existingResult.rows[0].amount) || 0;

    await pool.query(
      `UPDATE completed_investment_details
       SET investment_detail = $1, amount = $2, date_of_last_investment = $3,
           type_of_investment = $4, site_configuration_id = $5, investment_vehicle = $6,
           modified_on = NOW()
       WHERE id = $7`,
      [
        investmentDetail,
        totalInvestmentAmount,
        dateOfLastInvestment,
        updatedTypeIds,
        transactionTypeId || null,
        investmentVehicle || null,
        id,
      ]
    );

    if (note && note.trim()) {
      await pool.query(
        `INSERT INTO completed_investment_notes
          (completed_investment_id, note, created_by, created_at, old_amount, new_amount, transaction_type)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
        [id, note, loginUserId, oldAmount, totalInvestmentAmount || 0, transactionTypeId || null]
      );
    }

    res.json({ success: true, message: "Investment details updated successfully." });
  } catch (err: any) {
    console.error("Error saving completed investment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (id <= 0) {
      res.json({ success: false, message: "Invalid completed investment id" });
      return;
    }

    const result = await pool.query(
      `SELECT n.id, u.user_name AS "userName", n.old_amount AS "oldAmount",
              n.new_amount AS "newAmount", n.transaction_type AS "transactionType",
              n.created_at AS "createdAt", n.note
       FROM completed_investment_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.completed_investment_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    if (result.rows.length > 0) {
      const notes = result.rows.map((r: any) => ({
        ...r,
        id: Number(r.id),
        oldAmount: r.oldAmount != null ? parseFloat(r.oldAmount) : null,
        newAmount: r.newAmount != null ? parseFloat(r.newAmount) : null,
      }));
      res.json(notes);
    } else {
      res.json({ success: false, message: "Notes not found" });
    }
  } catch (err: any) {
    console.error("Error fetching completed investment notes:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/notes/:noteId", async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(String(req.params.noteId), 10);
    const { note, amount, transactionTypeId } = req.body;

    const noteResult = await pool.query(
      `SELECT id, completed_investment_id FROM completed_investment_notes WHERE id = $1`,
      [noteId]
    );

    if (noteResult.rows.length === 0) {
      res.json({ success: false, message: "Record not found." });
      return;
    }

    const existingNote = noteResult.rows[0];

    const previousResult = await pool.query(
      `SELECT new_amount FROM completed_investment_notes
       WHERE completed_investment_id = $1 AND id < $2
       ORDER BY id DESC LIMIT 1`,
      [existingNote.completed_investment_id, noteId]
    );

    const oldAmount = previousResult.rows.length > 0
      ? (parseFloat(previousResult.rows[0].new_amount) || 0)
      : 0;

    const loginUserId = req.user?.id;

    await pool.query(
      `UPDATE completed_investment_notes
       SET created_by = $1, note = $2, old_amount = $3, new_amount = $4, transaction_type = $5
       WHERE id = $6`,
      [loginUserId, note, oldAmount, amount || 0, transactionTypeId || null, noteId]
    );

    res.json({ success: true, message: "Investment note updated successfully." });
  } catch (err: any) {
    console.error("Error updating completed investment note:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const loginUserId = req.user?.id;

    const check = await pool.query(
      `SELECT id FROM completed_investment_details WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (check.rows.length === 0) {
      res.json({ success: false, message: "Completed investment not found." });
      return;
    }

    await pool.query(
      `UPDATE completed_investment_details SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [loginUserId, id]
    );

    res.json({ success: true, message: "Completed investment deleted successfully." });
  } catch (err: any) {
    console.error("Error deleting completed investment:", err);
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
    const result = await pool.query(
      `UPDATE completed_investment_details SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id IN (${placeholders}) AND is_deleted = true
       RETURNING id`,
      ids
    );

    if (result.rowCount === 0) {
      res.json({ success: false, message: "No deleted records found to restore." });
      return;
    }

    res.json({ success: true, message: `${result.rowCount} completed investment(s) restored successfully.` });
  } catch (err: any) {
    console.error("Error restoring completed investments:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
