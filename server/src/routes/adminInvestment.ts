import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, buildSortClause, handleMissingTableError } from "../utils/softDelete.js";
import { sendTemplateEmail } from "../utils/emailService.js";
import { Resend } from "resend";
import ExcelJS from "exceljs";
import { uploadBase64Image, resolveFileUrl, extractStoragePath, getSupabaseConfig } from "../utils/uploadBase64Image.js";
import { logAudit } from "../utils/auditLog.js";
import { restoreOwningUsersForRecordsInTx } from "../utils/userRestore.js";
import { findOrCreateAnonymousUser } from "../utils/anonymousUser.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

const router = Router();

const InvestmentStageEnum: Record<string, number> = {
  Private: 1,
  Public: 2,
  ClosedInvested: 3,
  ClosedNotInvested: 4,
  New: 5,
  ComplianceReview: 6,
  CompletedOngoing: 7,
  Vetting: 8,
  CompletedOngoingPrivate: 9,
};

const StageDisplayNames: Record<number, string> = {
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

const InvestmentRequestStatusNames: Record<number, string> = {
  0: "Draft",
  1: "Submitted",
  2: "Under Review",
  3: "Approved",
  4: "Rejected",
};

function formatDateMMDDYYYY(dateVal: any): string {
  if (!dateVal) return "";
  const d = dayjs.utc(dateVal);
  if (!d.isValid()) return "";
  return d.format("MM-DD-YYYY");
}

function convertHtmlNoteToPlainText(htmlNote: string | null | undefined): string {
  if (!htmlNote) return "";
  let result = htmlNote.replace(/<(b|strong)>\s*(.*?)\s*<\/\1>/gi, "@$2");
  result = result.replace(/<[^>]+>/g, "");
  result = result.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  return result.trim();
}


function normalizeMentionFormat(html: string): string {
  if (!html) return html;

  html = html.replace(/\uFEFF/g, "");

  html = html.replace(
    /<span[^>]*class="bg-sky-100[^"]*"[^>]*contenteditable="false"[^>]*>(\{.*?\})<\/span>/gis,
    "$1"
  );

  html = html.replace(
    /<span[^>]*class="mention"[^>]*data-value="(\{.*?\})"[^>]*>.*?<\/span>/gis,
    (_match, token) => {
      return `<span class="bg-sky-100 text-sky-900 rounded-md px-1.5 py-0.5 inline-block mx-0.5 font-medium select-none" contenteditable="false">${token}</span>`;
    }
  );

  html = html.replace(
    /(<span[^>]*contenteditable="false"[^>]*>(\{.*?\})<\/span>)\2/gs,
    "$1"
  );

  return html;
}

router.get("/types", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT id, name FROM investment_instruments ORDER BY name ASC`);
    const types = result.rows.map((r: any) => ({ id: Number(r.id), name: r.name }));
    types.push({ id: -1, name: "Other" });
    res.json(types);
  } catch (err: any) {
    console.error("Error fetching investment types:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/names", async (req: Request, res: Response) => {
  try {
    const stage = parseInt(String(req.query.stage || "0"), 10);
    const excludeId = parseInt(String(req.query.id || "0"), 10);

    if (stage === 4) {
      const result = await pool.query(
        `SELECT id, name, investment_instruments FROM campaigns
         WHERE stage != $1 AND TRIM(COALESCE(name, '')) != ''
         AND (is_deleted IS NULL OR is_deleted = false)
         ORDER BY name ASC`,
        [InvestmentStageEnum.ClosedNotInvested]
      );

      const invTypesResult = await pool.query(`SELECT id, name FROM investment_instruments`);
      const invTypeMap: Record<number, string> = {};
      for (const t of invTypesResult.rows) invTypeMap[t.id] = t.name;

      const campaigns = result.rows.map((r: any) => {
        let isPrivateDebt = false;
        if (r.investment_instruments) {
          const ids = r.investment_instruments
            .split(",")
            .map((s: string) => parseInt(s.trim(), 10))
            .filter((n: number) => !isNaN(n));
          isPrivateDebt = ids.some((id: number) => {
            const name = invTypeMap[id];
            return name && name.includes("Private Debt");
          });
        }
        return { id: Number(r.id), name: r.name, isPrivateDebt };
      });

      res.json(campaigns);
    } else if (stage === 3) {
      const result = await pool.query(
        `SELECT id, name FROM campaigns
         WHERE stage = $1 AND TRIM(COALESCE(name, '')) != ''
         AND (is_deleted IS NULL OR is_deleted = false)
         ORDER BY name ASC`,
        [InvestmentStageEnum.ClosedInvested]
      );
      res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name })));
    } else if (stage === 0) {
      const values: any[] = [];
      let condition = `TRIM(COALESCE(name, '')) != '' AND (is_deleted IS NULL OR is_deleted = false)`;
      if (excludeId > 0) {
        values.push(excludeId);
        condition += ` AND id != $1`;
      }
      const result = await pool.query(
        `SELECT id, name FROM campaigns WHERE ${condition} ORDER BY name ASC`,
        values
      );
      res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name })));
    } else if (stage === 10) {
      const result = await pool.query(
        `SELECT id, name FROM campaigns
         WHERE stage IN ($1, $2, $3) AND TRIM(COALESCE(name, '')) != ''
         AND (is_deleted IS NULL OR is_deleted = false)
         ORDER BY name ASC`,
        [
          InvestmentStageEnum.ClosedInvested,
          InvestmentStageEnum.CompletedOngoing,
          InvestmentStageEnum.CompletedOngoingPrivate,
        ]
      );
      res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name })));
    } else {
      res.status(400).json({ success: false, message: "Invalid investment stage." });
    }
  } catch (err: any) {
    console.error("Error fetching investment names:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/data", async (_req: Request, res: Response) => {
  try {
    const [sdgsResult, themesResult, typesResult, approvedByResult, tagsResult] = await Promise.all([
      pool.query(`SELECT id, name FROM sdgs ORDER BY id`),
      pool.query(`SELECT id, name FROM themes WHERE (is_deleted IS NULL OR is_deleted = false) ORDER BY id`),
      pool.query(`SELECT id, name FROM investment_instruments ORDER BY id`),
      pool.query(`SELECT id, name FROM approvers WHERE (is_deleted IS NULL OR is_deleted = false) ORDER BY id`),
      pool.query(`SELECT id, tag FROM investment_tags WHERE (is_deleted IS NULL OR is_deleted = false) ORDER BY id`),
    ]);

    res.json({
      sdg: sdgsResult.rows.map((r: any) => ({ id: Number(r.id), name: r.name })),
      theme: themesResult.rows.map((r: any) => ({ id: Number(r.id), name: r.name })),
      investmentType: typesResult.rows.map((r: any) => ({ id: Number(r.id), name: r.name })),
      approvedBy: approvedByResult.rows.map((r: any) => ({ id: Number(r.id), name: r.name })),
      investmentTag: tagsResult.rows.map((r: any) => ({ id: Number(r.id), tag: r.tag })),
    });
  } catch (err: any) {
    console.error("Error fetching investment data:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/countries", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, code FROM countries WHERE is_active = true ORDER BY sort_order ASC, name ASC`
    );
    res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name, code: r.code })));
  } catch (err: any) {
    console.error("Error fetching countries:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/document", async (req: Request, res: Response) => {
  try {
    const action = String(req.query.action || "");
    const pdfFileName = String(req.query.pdfFileName || "");
    const originalPdfFileName = String(req.query.originalPdfFileName || pdfFileName);
    const stream = req.query.stream === "true";

    if (!action || !pdfFileName) {
      res.json({ success: false, message: "Parameters required." });
      return;
    }

    let fileUrl: string | null = null;

    if (pdfFileName.startsWith("http://") || pdfFileName.startsWith("https://")) {
      fileUrl = pdfFileName;
    } else {
      fileUrl = resolveFileUrl(pdfFileName, "campaigns");
    }

    if (!fileUrl) {
      res.json({ success: false, message: "Document not found." });
      return;
    }

    if (!stream) {
      res.json({ success: true, message: fileUrl });
      return;
    }

    const storagePath = extractStoragePath(pdfFileName) || extractStoragePath(fileUrl);
    if (storagePath) {
      const { client: supabase, bucket } = getSupabaseConfig();
      const cleanPath = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      const { data, error } = await supabase.storage.from(bucket).download(cleanPath);
      if (error || !data) {
        res.status(502).json({ success: false, message: "Failed to download file from storage." });
        return;
      }

      const arrayBuffer = await data.arrayBuffer();
      res.setHeader("Content-Type", data.type || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(originalPdfFileName)}"`);
      res.send(Buffer.from(arrayBuffer));
      return;
    }

    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      res.status(502).json({ success: false, message: "Failed to fetch file from storage." });
      return;
    }

    const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(originalPdfFileName)}"`);

    const arrayBuffer = await fileResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error("Error getting document:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const campaignsResult = await pool.query(
      `SELECT c.*, gpa.name AS group_for_private_access_name
       FROM campaigns c
       LEFT JOIN groups gpa ON c.group_for_private_access_id = gpa.id
       WHERE (c.is_deleted IS NULL OR c.is_deleted = false)
       ORDER BY c.id`
    );

    const campaigns = campaignsResult.rows;
    const campaignIds = campaigns.map((c: any) => Number(c.id));

    let recMap: Record<number, { balance: number; investors: number }> = {};
    if (campaignIds.length > 0) {
      const recResult = await pool.query(
        `SELECT campaign_id,
                SUM(amount) AS balance,
                COUNT(DISTINCT LOWER(TRIM(user_email))) AS investors
         FROM recommendations
         WHERE amount > 0
           AND user_email IS NOT NULL
           AND TRIM(user_email) <> ''
           AND (LOWER(status) = 'approved' OR LOWER(status) = 'pending')
           AND (is_deleted IS NULL OR is_deleted = false)
         GROUP BY campaign_id`
      );
      for (const r of recResult.rows) {
        recMap[Number(r.campaign_id)] = {
          balance: parseFloat(r.balance) || 0,
          investors: parseInt(r.investors) || 0,
        };
      }
    }

    let tagMap: Record<number, string> = {};
    if (campaignIds.length > 0) {
      const tagResult = await pool.query(
        `SELECT itm.campaign_id, string_agg(it.tag, ', ') AS tags
         FROM investment_tag_mappings itm
         JOIN investment_tags it ON itm.tag_id = it.id
         GROUP BY itm.campaign_id`
      );
      for (const r of tagResult.rows) {
        tagMap[Number(r.campaign_id)] = r.tags;
      }
    }

    let lastNoteMap: Record<number, string> = {};
    if (campaignIds.length > 0) {
      const noteResult = await pool.query(
        `SELECT DISTINCT ON (campaign_id) campaign_id, note
         FROM investment_notes
         ORDER BY campaign_id, id DESC`
      );
      for (const r of noteResult.rows) {
        lastNoteMap[Number(r.campaign_id)] = r.note || "";
      }
    }

    let groupMap: Record<number, string[]> = {};
    if (campaignIds.length > 0) {
      const groupResult = await pool.query(
        `SELECT cg.campaigns_id, g.name
         FROM campaign_groups cg
         JOIN groups g ON cg.groups_id = g.id`
      );
      for (const r of groupResult.rows) {
        const cid = Number(r.campaigns_id);
        if (!groupMap[cid]) groupMap[cid] = [];
        groupMap[cid].push(r.name);
      }
    }

    let fundNameMap: Record<number, string> = {};
    const fundIds = campaigns
      .filter((c: any) => c.is_part_of_fund && c.associated_fund_id)
      .map((c: any) => Number(c.associated_fund_id));
    if (fundIds.length > 0) {
      const uniqueIds = [...new Set(fundIds)];
      const ph = uniqueIds.map((_, i) => `$${i + 1}`).join(", ");
      const fundResult = await pool.query(
        `SELECT id, name FROM campaigns WHERE id IN (${ph})`,
        uniqueIds
      );
      for (const r of fundResult.rows) {
        fundNameMap[Number(r.id)] = r.name;
      }
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Campaigns");

    const headers = [
      "Id", "Name", "Description", "Themes", "Approved By", "SDGs", "Type of Investment",
      "Terms", "Minimum Investment", "Website", "Contact Info FullName", "Contact Info Address1", "Contact Info Address2",
      "Investment Owner email", "Investment Informational Email", "Contact Info Phone Number", "Country", "Other Country Address", "City", "State", "ZipCode",
      "Tell us a bit about your network", "ImpactAssetsFundingStatus",
      "InvestmentRole", "How where you referred to CataCap?", "Target", "Status",
      "Tile Image File Name", "Image File Name", "Pdf File Name", "Original Pdf File Name",
      "Logo File Name", "Is Active", "Is Part Of Fund", "Associated Fund", "Featured Investment", "Stage", "Special Filters", "Property", "Added Total Admin Raised",
      "Groups", "Total Recommendations", "Total Investors", "Group For Private Access", "Email Sends",
      "Expected Fundraising Close Date", "Mission/Vision", "Personalized Thank You",
      "How much money do you already have in commitments for your investment",
      "Investment Type", "Equity / Valuation", "Equity / Security Type", "Fund / Term", "Equity / Funds Target Return",
      "Debt / Payment Frequency", "Debt / Maturity Date", "Debt / Interest Rate", "Created Date", "Last Note", "Meta Title", "Meta Description"
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => { cell.font = { bold: true }; });

    for (const c of campaigns) {
      const cid = Number(c.id);
      const rec = recMap[cid] || { balance: 0, investors: 0 };
      const tags = tagMap[cid] || "";
      const lastNote = lastNoteMap[cid] || "";
      const groups = groupMap[cid] || [];

      const stageDescription = c.stage != null ? (StageDisplayNames[c.stage] || String(c.stage)) : "";

      const parseCurrency = (val: any): number | null => {
        if (val == null || val === '') return null;
        const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, ''));
        return isNaN(num) ? null : num;
      };

      const dataRow = worksheet.addRow([
        c.id,
        c.name,
        c.description,
        c.themes,
        c.approved_by,
        c.sdgs,
        c.investment_instruments,
        c.terms,
        parseCurrency(c.minimum_investment),
        c.website,
        c.contact_info_full_name,
        c.contact_info_address,
        c.contact_info_address_2,
        c.contact_info_email_address,
        c.investment_informational_email,
        c.contact_info_phone_number,
        c.country,
        c.other_country_address,
        c.city,
        c.state,
        c.zip_code,
        c.network_description,
        c.impact_assets_funding_status,
        c.investment_role,
        c.referred_to_catacap,
        parseCurrency(c.target),
        c.status,
        c.tile_image_file_name,
        c.image_file_name,
        c.pdf_file_name,
        c.original_pdf_file_name,
        c.logo_file_name,
        c.is_active ? "Active" : "Inactive",
        c.is_part_of_fund ? "Yes" : "No",
        c.is_part_of_fund ? (fundNameMap[Number(c.associated_fund_id)] || "") : "",
        c.featured_investment ? "Yes" : "No",
        stageDescription,
        tags,
        c.property,
        parseCurrency(c.added_total_admin_raised) ?? 0,
        groups.join(","),
        parseCurrency(rec.balance) ?? 0,
        rec.investors,
        c.group_for_private_access_name || "",
        c.email_sends ? "Yes" : "No",
        c.fundraising_close_date,
        c.mission_and_vision,
        c.personalized_thank_you,
        parseCurrency(c.expected_total),
        c.investment_type_category,
        parseCurrency(c.equity_valuation),
        c.equity_security_type,
        c.fund_term ? formatDateMMDDYYYY(c.fund_term) : "",
        c.equity_target_return,
        c.debt_payment_frequency,
        c.debt_maturity_date ? formatDateMMDDYYYY(c.debt_maturity_date) : "",
        c.debt_interest_rate,
        c.created_date ? formatDateMMDDYYYY(c.created_date) : "",
        lastNote,
        c.meta_title,
        c.meta_description,
      ]);

      const currencyFmt = '"$"#,##0.00';
      const monetaryColumns = [9, 26, 40, 42, 49, 51];
      for (const col of monetaryColumns) {
        dataRow.getCell(col).numFmt = currencyFmt;
      }
    }

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 5, 50);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Investments.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting investments:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/request", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const page = params.currentPage;
    const pageSize = params.perPage;
    const isAsc = (params.sortDirection || "").toLowerCase() === "asc";
    const sortField = (params.sortField || "").toLowerCase();
    const searchValue = params.searchValue?.trim().toLowerCase() || "";
    const investmentRequestStatus = req.query.investmentRequestStatus || req.query.InvestmentRequestStatus;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    const isDeletedRaw = req.query.IsDeleted || req.query.isDeleted;
    if (isDeletedRaw !== undefined && String(isDeletedRaw).toLowerCase() === "true") {
      conditions.push(`ir.is_deleted = true`);
    } else {
      conditions.push(`(ir.is_deleted IS NULL OR ir.is_deleted = false)`);
    }

    if (investmentRequestStatus !== undefined && investmentRequestStatus !== null && investmentRequestStatus !== "") {
      conditions.push(`ir.status = $${paramIdx++}`);
      values.push(parseInt(String(investmentRequestStatus), 10));
    }

    if (searchValue) {
      conditions.push(`(
        LOWER(COALESCE(ir.organization_name, '')) LIKE $${paramIdx} OR
        LOWER(COALESCE(u.first_name || ' ' || u.last_name, '')) LIKE $${paramIdx} OR
        LOWER(COALESCE(u.email, '')) LIKE $${paramIdx}
      )`);
      values.push(`%${searchValue}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let orderBy: string;
    switch (sortField) {
      case "applicant":
        orderBy = isAsc ? "u.first_name ASC, u.last_name ASC" : "u.first_name DESC, u.last_name DESC";
        break;
      case "organization":
        orderBy = isAsc ? "ir.organization_name ASC" : "ir.organization_name DESC";
        break;
      case "status":
        orderBy = isAsc ? "ir.status ASC" : "ir.status DESC";
        break;
      case "createdat":
        orderBy = isAsc ? "ir.created_at ASC" : "ir.created_at DESC";
        break;
      default:
        orderBy = "ir.created_at DESC";
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM investment_requests ir LEFT JOIN users u ON ir.user_id = u.id AND (u.is_deleted IS NULL OR u.is_deleted = false) ${whereClause}`,
      values
    );
    const totalRecords = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT ir.id, u.first_name, u.last_name,
              COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') AS full_name,
              u.email, ir.organization_name AS organization, ir.country,
              ir.campaign_goal AS goal, ir.created_at AS submitted, ir.status
       FROM investment_requests ir
       LEFT JOIN users u ON ir.user_id = u.id AND (u.is_deleted IS NULL OR u.is_deleted = false)
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, pageSize, (page - 1) * pageSize]
    );

    const items = dataResult.rows.map((r: any) => ({
      id: Number(r.id),
      firstName: r.first_name || "",
      lastName: r.last_name || "",
      fullName: (r.full_name || "").trim(),
      email: r.email || "",
      organization: r.organization || "",
      country: r.country || "",
      goal: r.goal ? parseFloat(r.goal) : null,
      submitted: r.submitted,
      status: r.status,
      statusName: InvestmentRequestStatusNames[r.status] || "Unknown",
    }));

    res.json({ totalCount: totalRecords, items });
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("Error fetching investment requests:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/request/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      res.json({ success: false, message: "Invalid id." });
      return;
    }

    const result = await pool.query(
      `SELECT ir.*, u.first_name, u.last_name, u.email
       FROM investment_requests ir
       LEFT JOIN users u ON ir.user_id = u.id AND (u.is_deleted IS NULL OR u.is_deleted = false)
       WHERE ir.id = $1 AND (ir.is_deleted IS NULL OR ir.is_deleted = false)`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Investment request not found." });
      return;
    }

    const r = result.rows[0];
    res.json({
      item: {
        currentStep: r.current_step,
        status: r.status,
        statusName: InvestmentRequestStatusNames[r.status] || "Unknown",
        fullName: ((r.first_name || "") + " " + (r.last_name || "")).trim(),
        firstName: r.first_name || "",
        lastName: r.last_name || "",
        email: r.email || "",
        country: r.country,
        website: r.website,
        organizationName: r.organization_name,
        currentlyRaising: r.currently_raising,
        investmentTypes: r.investment_types,
        investmentThemes: r.investment_themes,
        themeDescription: r.theme_description,
        capitalRaised: r.capital_raised,
        referenceableInvestors: r.referenceable_investors,
        hasDonorCommitment: r.has_donor_commitment,
        softCircledAmount: r.soft_circled_amount ? parseFloat(r.soft_circled_amount) : 0,
        timeline: r.timeline,
        campaignGoal: r.campaign_goal ? parseFloat(r.campaign_goal) : 0,
        role: r.role,
        referralSource: r.referral_source,
        investmentTerms: r.investment_terms,
        whyBackYourInvestment: r.why_back_your_investment,
        logoFileName: resolveFileUrl(r.logo_file_name, "investment-requests"),
        heroImageFileName: resolveFileUrl(r.hero_image_file_name, "investment-requests"),
        pitchDeckFileName: resolveFileUrl(r.pitch_deck_file_name, "investment-requests"),
        logo: r.logo,
        heroImage: r.hero_image,
        pitchDeck: r.pitch_deck,
        createdAt: r.created_at,
      },
    });
  } catch (err: any) {
    console.error("Error fetching investment request by id:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      res.json({ success: false, message: "Invalid investment id" });
      return;
    }

    const result = await pool.query(
      `SELECT n.id, n.old_status AS "oldStatus", n.new_status AS "newStatus",
              n.note, u.user_name AS "userName", n.created_at AS "createdAt"
       FROM investment_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.campaign_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.json({ success: false, message: "Notes not found" });
    }
  } catch (err: any) {
    console.error("Error fetching investment notes:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/notes/export", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);

    const notesResult = await pool.query(
      `SELECT n.id, n.old_status, n.new_status, n.note, n.created_at,
              u.user_name, c.name AS campaign_name
       FROM investment_notes n
       LEFT JOIN users u ON n.created_by = u.id
       LEFT JOIN campaigns c ON n.campaign_id = c.id
       WHERE n.campaign_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    const notes = notesResult.rows;
    const campaignName = notes.length > 0 ? notes[0].campaign_name : "Investment Notes";

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("InvestmentNotes");

    worksheet.mergeCells("A1:E2");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Investment Name: " + (campaignName || "Investment Notes");
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    const headerRowNum = 3;
    const headers = ["Date", "Username", "From", "To", "Note"];
    const headerRow = worksheet.getRow(headerRowNum);
    headers.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    headerRow.font = { bold: true };

    notes.forEach((note: any, index: number) => {
      const row = worksheet.getRow(headerRowNum + 1 + index);
      row.getCell(1).value = note.created_at ? formatDateMMDDYYYY(note.created_at) : "";
      row.getCell(2).value = note.user_name || "";
      row.getCell(3).value = note.old_status || "";
      row.getCell(4).value = note.new_status || "";
      row.getCell(5).value = convertHtmlNoteToPlainText(note.note);
    });

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 10;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=InvestmentNotes.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting investment notes:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id/recommendations/export", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);

    const recResult = await pool.query(
      `SELECT r.user_full_name, c.name AS campaign_name, r.amount, r.date_created,
              pg.status AS pending_grant_status
       FROM recommendations r
       JOIN campaigns c ON r.campaign_id = c.id
       LEFT JOIN pending_grants pg ON r.pending_grants_id = pg.id
       WHERE r.campaign_id = $1
         AND (r.is_deleted IS NULL OR r.is_deleted = false)
         AND (LOWER(TRIM(r.status)) = 'pending' OR LOWER(TRIM(r.status)) = 'approved')
       ORDER BY r.id DESC`,
      [id]
    );

    if (recResult.rows.length === 0) {
      res.json({ success: false, message: "There are no recommendations to export for your investment." });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Recommendations");

    const headerRow = worksheet.addRow(["UserFullName", "InvestmentName", "Amount", "DateCreated", "InTransitGrant?"]);
    headerRow.eachCell((cell) => { cell.font = { bold: true }; });

    for (const r of recResult.rows) {
      const isInTransit = r.pending_grant_status && r.pending_grant_status.toLowerCase().trim() === "in transit" ? "Yes" : "";
      const dataRow = worksheet.addRow([
        r.user_full_name || "",
        r.campaign_name || "",
        Math.round((parseFloat(r.amount) || 0) * 100) / 100,
        r.date_created ? new Date(r.date_created) : "",
        isInTransit,
      ]);
      dataRow.getCell(3).numFmt = "$#,##0.00";
      dataRow.getCell(4).numFmt = "MM/dd/yy HH:mm";
    }

    worksheet.columns.forEach((col) => {
      col.alignment = { horizontal: "left" };
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 5;
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Recommendations.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting recommendations:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const idOrSlug = req.params.id;
    const numericId = /^\d+$/.test(idOrSlug) ? parseInt(idOrSlug, 10) : NaN;

    let campaignResult;
    if (Number.isFinite(numericId) && numericId > 0) {
      campaignResult = await pool.query(
        `SELECT c.*, gpa.id AS gpa_id, gpa.name AS gpa_name
         FROM campaigns c
         LEFT JOIN groups gpa ON c.group_for_private_access_id = gpa.id
         WHERE c.id = $1`,
        [numericId]
      );
    } else {
      campaignResult = await pool.query(
        `SELECT c.*, gpa.id AS gpa_id, gpa.name AS gpa_name
         FROM campaigns c
         LEFT JOIN groups gpa ON c.group_for_private_access_id = gpa.id
         WHERE LOWER(TRIM(COALESCE(c.property, ''))) = LOWER(TRIM($1))
         LIMIT 1`,
        [idOrSlug]
      );
    }

    if (campaignResult.rows.length === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const c = campaignResult.rows[0];
    const id = c.id;

    const balanceResult = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN LOWER(status) = 'approved' OR LOWER(status) = 'pending' THEN amount ELSE 0 END), 0) AS balance,
              COUNT(DISTINCT CASE WHEN (LOWER(status) = 'approved' OR LOWER(status) = 'pending') AND amount > 0 AND user_email IS NOT NULL THEN user_email END) AS investors
       FROM recommendations
       WHERE campaign_id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );
    const currentBalance = parseFloat(balanceResult.rows[0]?.balance) || 0;
    const numberOfInvestors = parseInt(balanceResult.rows[0]?.investors) || 0;

    const notesResult = await pool.query(
      `SELECT n.id, n.old_status, n.new_status, n.note, n.created_at, u.user_name
       FROM investment_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.campaign_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    const investmentNotes = notesResult.rows.map((n: any) => ({
      date: n.created_at ? dayjs.utc(n.created_at).format("MM/DD/YYYY") : "",
      userName: n.user_name || "",
      note: n.note || "",
      oldStatus: n.old_status || null,
      newStatus: n.new_status || null,
    }));

    const tagResult = await pool.query(
      `SELECT it.tag
       FROM investment_tag_mappings itm
       JOIN investment_tags it ON itm.tag_id = it.id
       WHERE itm.campaign_id = $1`,
      [id]
    );
    const investmentTag = tagResult.rows.map((t: any) => ({ tag: t.tag }));

    let terms = c.terms || "";
    if (terms) terms = normalizeMentionFormat(terms);

    const campaign: any = {
      id: Number(c.id),
      name: c.name,
      description: c.description,
      themes: c.themes,
      approvedBy: c.approved_by,
      sdGs: c.sdgs,
      investmentTypes: c.investment_instruments,
      terms,
      minimumInvestment: c.minimum_investment,
      website: c.website,
      networkDescription: c.network_description,
      contactInfoFullName: c.contact_info_full_name,
      contactInfoAddress: c.contact_info_address,
      contactInfoAddress2: c.contact_info_address_2,
      contactInfoEmailAddress: c.contact_info_email_address,
      investmentInformationalEmail: c.investment_informational_email,
      contactInfoPhoneNumber: c.contact_info_phone_number,
      otherCountryAddress: c.other_country_address,
      country: c.country,
      city: c.city,
      state: c.state,
      zipCode: c.zip_code,
      impactAssetsFundingStatus: c.impact_assets_funding_status,
      investmentRole: c.investment_role,
      referredToCataCap: c.referred_to_catacap,
      target: c.target,
      status: c.status,
      tileImageFileName: resolveFileUrl(c.tile_image_file_name, "campaigns"),
      imageFileName: resolveFileUrl(c.image_file_name, "campaigns"),
      pdfFileName: resolveFileUrl(c.pdf_file_name, "campaigns"),
      originalPdfFileName: c.original_pdf_file_name || null,
      logoFileName: resolveFileUrl(c.logo_file_name, "campaigns"),
      isActive: c.is_active,
      isPartOfFund: c.is_part_of_fund || false,
      associatedFundId: c.associated_fund_id,
      stage: c.stage,
      property: c.property,
      addedTotalAdminRaised: c.added_total_admin_raised,
      currentBalance,
      numberOfInvestors,
      groupForPrivateAccessDto: c.gpa_id ? { id: Number(c.gpa_id), name: c.gpa_name } : null,
      emailSends: c.email_sends,
      fundraisingCloseDate: c.fundraising_close_date,
      missionAndVision: c.mission_and_vision,
      personalizedThankYou: c.personalized_thank_you,
      hasExistingInvestors: c.has_existing_investors,
      hasCorporateBankAccount: c.has_corporate_bank_account,
      hasPersonalFinancialBenefit: c.has_personal_financial_benefit,
      personalFinancialBenefitDescription: c.personal_financial_benefit_description,
      hasRegulatoryIssues: c.has_regulatory_issues,
      regulatoryIssuesDescription: c.regulatory_issues_description,
      isInGoodLegalStanding: c.is_in_good_legal_standing,
      expectedTotal: c.expected_total ? parseFloat(c.expected_total) : null,
      investmentTypeCategory: c.investment_type_category,
      equityValuation: c.equity_valuation ? parseFloat(c.equity_valuation) : null,
      equitySecurityType: c.equity_security_type,
      fundTerm: c.fund_term,
      equityTargetReturn: c.equity_target_return ? parseFloat(c.equity_target_return) : null,
      debtPaymentFrequency: c.debt_payment_frequency,
      debtMaturityDate: c.debt_maturity_date,
      debtInterestRate: c.debt_interest_rate ? parseFloat(c.debt_interest_rate) : null,
      featuredInvestment: c.featured_investment || false,
      createdDate: c.created_date,
      modifiedDate: c.modified_date,
      investmentNotes,
      investmentTag,
      metaTitle: c.meta_title,
      metaDescription: c.meta_description,
      groupForPrivateAccessId: c.group_for_private_access_id,
    };

    res.json(campaign);
  } catch (err: any) {
    console.error("Error fetching investment by id:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const page = params.currentPage;
    const pageSize = params.perPage;
    const isAsc = (params.sortDirection || "").toLowerCase() === "asc";
    const searchValue = (params.searchValue || "").trim().toLowerCase();
    const stages = (req.query.Stages || req.query.stages) as string | undefined;
    const investmentStatusRaw = req.query.InvestmentStatus || req.query.investmentStatus;

    const recResult = await pool.query(
      `SELECT campaign_id,
              SUM(amount) AS current_balance,
              COUNT(DISTINCT user_email) AS number_of_investors
       FROM recommendations
       WHERE amount > 0 AND user_email IS NOT NULL
         AND (LOWER(status) = 'approved' OR LOWER(status) = 'pending')
         AND (is_deleted IS NULL OR is_deleted = false)
       GROUP BY campaign_id`
    );
    const recMap: Record<number, { currentBalance: number; numberOfInvestors: number }> = {};
    for (const r of recResult.rows) {
      recMap[Number(r.campaign_id)] = {
        currentBalance: parseFloat(r.current_balance) || 0,
        numberOfInvestors: parseInt(r.number_of_investors) || 0,
      };
    }

    const notesSetResult = await pool.query(
      `SELECT DISTINCT campaign_id FROM investment_notes WHERE campaign_id IS NOT NULL`
    );
    const notesSet = new Set(notesSetResult.rows.map((r: any) => Number(r.campaign_id)));

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    softDeleteFilter("c", params.isDeleted, conditions);

    if (searchValue) {
      conditions.push(`LOWER(COALESCE(c.name, '')) LIKE $${paramIdx}`);
      values.push(`%${searchValue}%`);
      paramIdx++;
    }

    if (stages) {
      const stageList = stages.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (stageList.length > 0) {
        const ph = stageList.map((_, i) => `$${paramIdx + i}`).join(", ");
        conditions.push(`c.stage IN (${ph})`);
        values.push(...stageList);
        paramIdx += stageList.length;
      }
    }

    if (investmentStatusRaw !== undefined && investmentStatusRaw !== null && investmentStatusRaw !== "") {
      const investmentStatus = String(investmentStatusRaw).toLowerCase() === "true";
      conditions.push(`c.is_active = $${paramIdx}`);
      values.push(investmentStatus);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const queryText = `
      SELECT c.id, c.name, c.created_date, c.stage, c.fundraising_close_date,
             c.is_active, c.property, c.original_pdf_file_name, c.image_file_name,
             c.pdf_file_name, c.meta_title, c.meta_description,
             c.deleted_at, du.first_name AS deleted_by_first, du.last_name AS deleted_by_last
      FROM campaigns c
      LEFT JOIN users du ON c.deleted_by = du.id
      ${whereClause}
    `;

    const campaignResult = await pool.query(queryText, values);

    let enrichedCampaigns = campaignResult.rows
      .filter((c: any) => c.id != null)
      .map((c: any) => {
        const cid = Number(c.id);
        const rec = recMap[cid] || { currentBalance: 0, numberOfInvestors: 0 };
        return {
          id: cid,
          name: c.name,
          createdDate: c.created_date,
          stage: c.stage,
          fundraisingCloseDate: c.fundraising_close_date,
          isActive: c.is_active,
          property: c.property,
          originalPdfFileName: c.original_pdf_file_name || null,
          imageFileName: resolveFileUrl(c.image_file_name, "campaigns"),
          pdfFileName: resolveFileUrl(c.pdf_file_name, "campaigns"),
          currentBalance: rec.currentBalance,
          numberOfInvestors: rec.numberOfInvestors,
          hasNotes: notesSet.has(cid),
          metaTitle: c.meta_title,
          metaDescription: c.meta_description,
          deletedAt: c.deleted_at,
          deletedBy: c.deleted_by_first ? `${c.deleted_by_first} ${c.deleted_by_last || ""}`.trim() : null,
        };
      });

    const sortFieldLower = (params.sortField || "").toLowerCase();
    enrichedCampaigns.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortFieldLower) {
        case "name":
          cmp = ((a.name || "").trim()).localeCompare((b.name || "").trim());
          break;
        case "createddate":
          cmp = new Date(a.createdDate || 0).getTime() - new Date(b.createdDate || 0).getTime();
          break;
        case "catacapfunding":
          cmp = (a.currentBalance || 0) - (b.currentBalance || 0);
          break;
        case "totalinvestors":
          cmp = (a.numberOfInvestors || 0) - (b.numberOfInvestors || 0);
          break;
        default:
          cmp = new Date(a.createdDate || 0).getTime() - new Date(b.createdDate || 0).getTime();
          return isAsc ? cmp : -cmp;
      }
      return isAsc ? cmp : -cmp;
    });

    const totalCount = enrichedCampaigns.length;
    const pagedResult = enrichedCampaigns.slice((page - 1) * pageSize, page * pageSize);

    res.json({ items: pagedResult, totalCount });
  } catch (err: any) {
    console.error("Error fetching investments:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const campaign = req.body;
    if (!campaign) {
      res.json({ success: false, message: "Campaign data is required." });
      return;
    }

    if (!campaign.contactInfoEmailAddress) {
      res.json({ success: false, message: "Email is required." });
      return;
    }

    if (!campaign.firstName || !(campaign.firstName || "").trim()) {
      res.json({ success: false, message: "First Name is required." });
      return;
    }

    if (!campaign.lastName || !(campaign.lastName || "").trim()) {
      res.json({ success: false, message: "Last Name is required." });
      return;
    }

    const { id: userId } = await findOrCreateAnonymousUser(
      campaign.contactInfoEmailAddress,
      campaign.firstName,
      campaign.lastName
    );

    let pdfFileName = extractStoragePath(campaign.pdfFileName) || null;
    let imageFileName = extractStoragePath(campaign.imageFileName) || null;
    let tileImageFileName = extractStoragePath(campaign.tileImageFileName) || null;
    let logoFileName = extractStoragePath(campaign.logoFileName) || null;

    if (campaign.pdfPresentation || campaign.PDFPresentation) {
      const result = await uploadBase64Image(campaign.pdfPresentation || campaign.PDFPresentation, "campaigns");
      pdfFileName = result.filePath;
    }
    if (campaign.image) {
      const result = await uploadBase64Image(campaign.image, "campaigns");
      imageFileName = result.filePath;
    }
    if (campaign.tileImage) {
      const result = await uploadBase64Image(campaign.tileImage, "campaigns");
      tileImageFileName = result.filePath;
    }
    if (campaign.logo) {
      const result = await uploadBase64Image(campaign.logo, "campaigns");
      logoFileName = result.filePath;
    }

    const insertResult = await pool.query(
      `INSERT INTO campaigns (
        name, description, themes, approved_by, sdgs, investment_instruments, terms,
        minimum_investment, website, network_description, contact_info_full_name,
        contact_info_address, contact_info_address_2, contact_info_email_address,
        investment_informational_email, contact_info_phone_number, country,
        other_country_address, city, state, zip_code, impact_assets_funding_status,
        investment_role, referred_to_catacap, target, status, stage, is_active,
        pdf_file_name, original_pdf_file_name, image_file_name, tile_image_file_name,
        logo_file_name, property, added_total_admin_raised, email_sends,
        group_for_private_access_id, fundraising_close_date, mission_and_vision,
        personalized_thank_you, has_existing_investors, expected_total,
        is_part_of_fund, associated_fund_id, featured_investment,
        investment_type_category, equity_valuation, equity_security_type,
        fund_term, equity_target_return, debt_payment_frequency,
        debt_maturity_date, debt_interest_rate, user_id,
        meta_title, meta_description,
        has_corporate_bank_account, has_personal_financial_benefit,
        personal_financial_benefit_description, has_regulatory_issues,
        regulatory_issues_description, is_in_good_legal_standing,
        created_date, modified_date
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
        $39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,
        $57,$58,$59,$60,$61,$62,NOW(),NOW()
      ) RETURNING id`,
      [
        campaign.name || null,
        campaign.description || null,
        campaign.themes || null,
        campaign.approvedBy || null,
        campaign.sdGs || campaign.sdgs || null,
        campaign.investmentTypes || null,
        campaign.terms || null,
        campaign.minimumInvestment || null,
        campaign.website || null,
        campaign.networkDescription || null,
        campaign.contactInfoFullName || null,
        campaign.contactInfoAddress || null,
        campaign.contactInfoAddress2 || null,
        campaign.contactInfoEmailAddress || null,
        campaign.investmentInformationalEmail || null,
        campaign.contactInfoPhoneNumber || null,
        campaign.country || null,
        campaign.otherCountryAddress || null,
        campaign.city || null,
        campaign.state || null,
        campaign.zipCode || null,
        campaign.impactAssetsFundingStatus || null,
        campaign.investmentRole || null,
        campaign.referredToCataCap || null,
        campaign.target || null,
        "0",
        InvestmentStageEnum.New,
        false,
        pdfFileName,
        campaign.originalPdfFileName || pdfFileName,
        imageFileName,
        tileImageFileName,
        logoFileName,
        campaign.property || null,
        0,
        false,
        campaign.groupForPrivateAccessDto?.id || null,
        campaign.fundraisingCloseDate || null,
        campaign.missionAndVision || null,
        campaign.personalizedThankYou || null,
        campaign.hasExistingInvestors || false,
        campaign.expectedTotal || null,
        campaign.isPartOfFund || false,
        campaign.associatedFundId || null,
        campaign.featuredInvestment || false,
        campaign.investmentTypeCategory || null,
        campaign.equityValuation || null,
        campaign.equitySecurityType || null,
        campaign.fundTerm || null,
        campaign.equityTargetReturn || null,
        campaign.debtPaymentFrequency || null,
        campaign.debtMaturityDate || null,
        campaign.debtInterestRate || null,
        userId,
        campaign.metaTitle || null,
        campaign.metaDescription || null,
        campaign.hasCorporateBankAccount ?? null,
        campaign.hasPersonalFinancialBenefit ?? null,
        campaign.personalFinancialBenefitDescription || null,
        campaign.hasRegulatoryIssues ?? null,
        campaign.regulatoryIssuesDescription || null,
        campaign.isInGoodLegalStanding ?? null,
      ]
    );

    const newCampaignId = insertResult.rows[0].id;

    if (campaign.investmentTag && Array.isArray(campaign.investmentTag) && campaign.investmentTag.length > 0) {
      await handleTagMappings(newCampaignId, campaign.investmentTag);
    }

    await logAudit({
      tableName: "campaigns",
      recordId: String(newCampaignId),
      actionType: "Created",
      newValues: {
        name: campaign.name || null,
        stage: InvestmentStageEnum.New,
        is_active: false,
        contact_info_email_address: campaign.contactInfoEmailAddress || null,
      },
      updatedBy: req.user?.id || null,
    });

    res.json({ success: true, message: "Investment has been created successfully." });
  } catch (err: any) {
    console.error("Error creating investment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/restore", async (req: Request, res: Response) => {
  try {
    const ids = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.json({ success: false, message: "No IDs provided." });
      return;
    }

    const campaignResult = await pool.query(
      `SELECT id, user_id FROM campaigns WHERE id = ANY($1) AND is_deleted = true`,
      [ids]
    );

    if (campaignResult.rows.length === 0) {
      res.json({ success: false, message: "No deleted campaigns found." });
      return;
    }

    const campaignIds = campaignResult.rows.map((r: any) => Number(r.id));
    const campaignOwnerIds = campaignResult.rows.map((r: any) => r.user_id);
    let restoredUserCount = 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const pgResult = await client.query(
        `SELECT id FROM pending_grants WHERE campaign_id = ANY($1) AND is_deleted = true`,
        [campaignIds]
      );
      const pendingGrantIds = pgResult.rows.map((r: any) => r.id);

      const assetResult = await client.query(
        `SELECT id FROM asset_based_payment_requests WHERE campaign_id = ANY($1) AND is_deleted = true`,
        [campaignIds]
      );
      const assetIds = assetResult.rows.map((r: any) => r.id);

      const rmResult = await client.query(
        `SELECT id FROM return_masters WHERE campaign_id = ANY($1)`,
        [campaignIds]
      );
      const returnMasterIds = rmResult.rows.map((r: any) => r.id);

      if (returnMasterIds.length > 0) {
        await client.query(
          `UPDATE return_details SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
           WHERE return_master_id = ANY($1) AND is_deleted = true`,
          [returnMasterIds]
        );
      }

      if (pendingGrantIds.length > 0) {
        await client.query(
          `UPDATE scheduled_email_logs SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
           WHERE pending_grant_id = ANY($1) AND is_deleted = true`,
          [pendingGrantIds]
        );
      }

      const logConditions: string[] = [];
      const logParams: any[] = [];
      let paramIdx = 1;

      logParams.push(campaignIds);
      logConditions.push(`campaign_id = ANY($${paramIdx++})`);

      if (assetIds.length > 0) {
        logParams.push(assetIds);
        logConditions.push(`asset_based_payment_request_id = ANY($${paramIdx++})`);
      }

      if (pendingGrantIds.length > 0) {
        logParams.push(pendingGrantIds);
        logConditions.push(`pending_grants_id = ANY($${paramIdx++})`);
      }

      await client.query(
        `UPDATE account_balance_change_logs SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE (${logConditions.join(" OR ")}) AND is_deleted = true`,
        logParams
      );

      if (pendingGrantIds.length > 0) {
        await client.query(
          `UPDATE recommendations SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
           WHERE pending_grants_id = ANY($1) AND is_deleted = true`,
          [pendingGrantIds]
        );
      }

      await client.query(
        `UPDATE recommendations SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE campaign_id = ANY($1) AND is_deleted = true`,
        [campaignIds]
      );

      if (pendingGrantIds.length > 0) {
        await client.query(
          `UPDATE pending_grants SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
           WHERE id = ANY($1) AND is_deleted = true`,
          [pendingGrantIds]
        );
      }

      if (assetIds.length > 0) {
        await client.query(
          `UPDATE asset_based_payment_requests SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
           WHERE id = ANY($1) AND is_deleted = true`,
          [assetIds]
        );
      }

      await client.query(
        `UPDATE disbursal_requests SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE campaign_id = ANY($1) AND is_deleted = true`,
        [campaignIds]
      );

      await client.query(
        `UPDATE completed_investment_details SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE campaign_id = ANY($1) AND is_deleted = true`,
        [campaignIds]
      );

      await client.query(
        `UPDATE user_investments SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE campaign_id = ANY($1) AND is_deleted = true`,
        [campaignIds]
      );

      await client.query(
        `UPDATE campaigns SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE id = ANY($1)`,
        [campaignIds]
      );

      const restoredUsers = await restoreOwningUsersForRecordsInTx(client, campaignOwnerIds, req.user?.id || null);
      restoredUserCount = restoredUsers.length;

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    for (const cid of campaignIds) {
      await logAudit({
        tableName: "campaigns",
        recordId: String(cid),
        actionType: "Modified",
        oldValues: { is_deleted: true },
        newValues: { is_deleted: false },
        updatedBy: req.user?.id || null,
      });
    }

    const count = campaignIds.length;
    res.json({
      success: true,
      message: `${count} campaign(s) restored successfully.`,
      restoredCount: count,
      restoredUserCount,
    });
  } catch (err: any) {
    console.error("Error restoring campaigns:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id/status", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = String(req.query.status).toLowerCase() === "true";

    const beforeResult = await pool.query(`SELECT is_active FROM campaigns WHERE id = $1`, [id]);
    const oldIsActive = beforeResult.rows[0]?.is_active;

    const result = await pool.query(
      `UPDATE campaigns SET is_active = $1, modified_date = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ message: "Campaign not found" });
      return;
    }

    const campaign = result.rows[0];

    await logAudit({
      tableName: "campaigns",
      recordId: String(id),
      actionType: "Modified",
      oldValues: { is_active: oldIsActive },
      newValues: { is_active: status },
      updatedBy: req.user?.id || null,
    });

    if (status) {
      const requestOrigin = process.env.REQUEST_ORIGIN || process.env.VITE_FRONTEND_URL || "";
      const logoUrl = process.env.LOGO_URL || "";
      const now = new Date();
      const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;

      try {
        await sendTemplateEmail(11, "investments@catacap.org", {
          logoUrl,
          date: dateStr,
          investmentLink: `${requestOrigin}/investments/${campaign.property}`,
          campaignName: campaign.name || "",
        });
      } catch (emailErr: any) {
        console.error("Error sending investment approved email:", emailErr);
      }
    }

    res.json(mapCampaignRow(campaign));
  } catch (err: any) {
    console.error("Error updating investment status:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }

    const campaign = req.body;

    if (campaign.property) {
      const slugExists = await pool.query(
        `SELECT id FROM slugs WHERE type = 1 AND reference_id != $1 AND value = $2 LIMIT 1`,
        [id, campaign.property]
      );
      const propExists = await pool.query(
        `SELECT id FROM campaigns WHERE id != $1 AND LOWER(TRIM(COALESCE(property, ''))) = $2 LIMIT 1`,
        [id, campaign.property.toLowerCase().trim()]
      );

      if (slugExists.rows.length > 0 || propExists.rows.length > 0) {
        res.json({ success: false, message: "Investment name for URL already exists." });
        return;
      }
    }

    let pdfFileName = extractStoragePath(campaign.pdfFileName) || null;
    let imageFileName = extractStoragePath(campaign.imageFileName) || null;
    let tileImageFileName = extractStoragePath(campaign.tileImageFileName) || null;
    let logoFileName = extractStoragePath(campaign.logoFileName) || null;

    if (campaign.pdfPresentation || campaign.PDFPresentation) {
      const result = await uploadBase64Image(campaign.pdfPresentation || campaign.PDFPresentation, "campaigns");
      pdfFileName = result.filePath;
    }
    if (campaign.image) {
      const result = await uploadBase64Image(campaign.image, "campaigns");
      imageFileName = result.filePath;
    }
    if (campaign.tileImage) {
      const result = await uploadBase64Image(campaign.tileImage, "campaigns");
      tileImageFileName = result.filePath;
    }
    if (campaign.logo) {
      const result = await uploadBase64Image(campaign.logo, "campaigns");
      logoFileName = result.filePath;
    }

    const existingResult = await pool.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    if (existingResult.rows.length === 0) {
      res.status(404).json({ message: "Campaign not found" });
      return;
    }
    const existing = existingResult.rows[0];

    if (existing.property && existing.property.trim()) {
      const currentSlug = await pool.query(
        `SELECT id FROM slugs WHERE type = 1 AND value = $1 LIMIT 1`,
        [existing.property]
      );
      if (currentSlug.rows.length === 0) {
        await pool.query(
          `INSERT INTO slugs (reference_id, type, value, created_at) VALUES ($1, 1, $2, NOW())`,
          [id, existing.property]
        );
      }
    }

    const userRole = req.user?.role?.toLowerCase() || "";
    const isAdmin = userRole === "admin" || userRole === "superadmin" || req.user?.isSuperAdmin;

    let finalMinimumInvestment = campaign.minimumInvestment;
    let finalApprovedBy = campaign.approvedBy;
    let finalStage = campaign.stage;
    let finalProperty = campaign.property;
    let finalAddedTotalAdminRaised = campaign.addedTotalAdminRaised;
    let finalIsActive = campaign.isActive;
    let finalGroupForPrivateAccessId = campaign.groupForPrivateAccessDto?.id || campaign.groupForPrivateAccessId || null;

    if (!isAdmin) {
      finalMinimumInvestment = existing.minimum_investment;
      finalApprovedBy = existing.approved_by;
      finalStage = existing.stage;
      finalProperty = existing.property;
      finalAddedTotalAdminRaised = existing.added_total_admin_raised;
      finalIsActive = existing.is_active;
      finalGroupForPrivateAccessId = existing.group_for_private_access_id;
    }

    let finalUserId = existing.user_id;
    if ((campaign.contactInfoEmailAddress || "").trim()) {
      const { id: resolvedUserId } = await findOrCreateAnonymousUser(
        campaign.contactInfoEmailAddress,
        campaign.firstName || campaign.contactInfoFullName?.split(" ")[0] || "",
        campaign.lastName || campaign.contactInfoFullName?.split(" ").slice(1).join(" ") || ""
      );
      finalUserId = resolvedUserId;
    }

    await pool.query(
      `UPDATE campaigns SET
        name = $1, description = $2, themes = $3, approved_by = $4, sdgs = $5,
        investment_instruments = $6, terms = $7, minimum_investment = $8, website = $9,
        network_description = $10, contact_info_full_name = $11, contact_info_address = $12,
        contact_info_address_2 = $13, contact_info_email_address = $14,
        investment_informational_email = $15, contact_info_phone_number = $16,
        country = $17, other_country_address = $18, city = $19, state = $20,
        zip_code = $21, impact_assets_funding_status = $22, investment_role = $23,
        referred_to_catacap = $24, target = $25, pdf_file_name = $26,
        original_pdf_file_name = $27, image_file_name = $28, tile_image_file_name = $29,
        logo_file_name = $30, property = $31, stage = $32, is_active = $33,
        added_total_admin_raised = $34, group_for_private_access_id = $35,
        email_sends = $36, fundraising_close_date = $37, mission_and_vision = $38,
        personalized_thank_you = $39, has_existing_investors = $40, expected_total = $41,
        is_part_of_fund = $42, associated_fund_id = $43, featured_investment = $44,
        investment_type_category = $45, equity_valuation = $46, equity_security_type = $47,
        fund_term = $48, equity_target_return = $49, debt_payment_frequency = $50,
        debt_maturity_date = $51, debt_interest_rate = $52,
        user_id = $53,
        meta_title = $54, meta_description = $55,
        has_corporate_bank_account = $56, has_personal_financial_benefit = $57,
        personal_financial_benefit_description = $58, has_regulatory_issues = $59,
        regulatory_issues_description = $60, is_in_good_legal_standing = $61,
        modified_date = NOW()
      WHERE id = $62`,
      [
        campaign.name || existing.name,
        campaign.description ?? existing.description,
        campaign.themes ?? existing.themes,
        finalApprovedBy ?? existing.approved_by,
        campaign.sdGs || campaign.sdgs || existing.sdgs,
        campaign.investmentTypes ?? existing.investment_instruments,
        campaign.terms ?? existing.terms,
        finalMinimumInvestment ?? existing.minimum_investment,
        campaign.website ?? existing.website,
        campaign.networkDescription ?? existing.network_description,
        campaign.contactInfoFullName ?? existing.contact_info_full_name,
        campaign.contactInfoAddress ?? existing.contact_info_address,
        campaign.contactInfoAddress2 ?? existing.contact_info_address_2,
        campaign.contactInfoEmailAddress ?? existing.contact_info_email_address,
        campaign.investmentInformationalEmail ?? existing.investment_informational_email,
        campaign.contactInfoPhoneNumber ?? existing.contact_info_phone_number,
        campaign.country ?? existing.country,
        campaign.otherCountryAddress ?? existing.other_country_address,
        campaign.city ?? existing.city,
        campaign.state ?? existing.state,
        campaign.zipCode ?? existing.zip_code,
        campaign.impactAssetsFundingStatus ?? existing.impact_assets_funding_status,
        campaign.investmentRole ?? existing.investment_role,
        campaign.referredToCataCap ?? existing.referred_to_catacap,
        campaign.target ?? existing.target,
        pdfFileName || existing.pdf_file_name,
        campaign.originalPdfFileName || pdfFileName || existing.original_pdf_file_name,
        imageFileName || existing.image_file_name,
        tileImageFileName || existing.tile_image_file_name,
        logoFileName || existing.logo_file_name,
        finalProperty ?? existing.property,
        finalStage ?? existing.stage,
        finalIsActive ?? existing.is_active,
        finalAddedTotalAdminRaised ?? existing.added_total_admin_raised,
        finalGroupForPrivateAccessId,
        campaign.emailSends ?? existing.email_sends,
        campaign.fundraisingCloseDate ?? existing.fundraising_close_date,
        campaign.missionAndVision ?? existing.mission_and_vision,
        campaign.personalizedThankYou ?? existing.personalized_thank_you,
        campaign.hasExistingInvestors ?? existing.has_existing_investors,
        campaign.expectedTotal ?? existing.expected_total,
        campaign.isPartOfFund ?? existing.is_part_of_fund,
        campaign.associatedFundId ?? existing.associated_fund_id,
        campaign.featuredInvestment ?? existing.featured_investment,
        campaign.investmentTypeCategory ?? existing.investment_type_category,
        campaign.equityValuation ?? existing.equity_valuation,
        campaign.equitySecurityType ?? existing.equity_security_type,
        campaign.fundTerm ?? existing.fund_term,
        campaign.equityTargetReturn ?? existing.equity_target_return,
        campaign.debtPaymentFrequency ?? existing.debt_payment_frequency,
        campaign.debtMaturityDate ?? existing.debt_maturity_date,
        campaign.debtInterestRate ?? existing.debt_interest_rate,
        finalUserId,
        campaign.metaTitle ?? existing.meta_title,
        campaign.metaDescription ?? existing.meta_description,
        Object.prototype.hasOwnProperty.call(campaign, "hasCorporateBankAccount") ? campaign.hasCorporateBankAccount : existing.has_corporate_bank_account,
        Object.prototype.hasOwnProperty.call(campaign, "hasPersonalFinancialBenefit") ? campaign.hasPersonalFinancialBenefit : existing.has_personal_financial_benefit,
        Object.prototype.hasOwnProperty.call(campaign, "personalFinancialBenefitDescription") ? campaign.personalFinancialBenefitDescription : existing.personal_financial_benefit_description,
        Object.prototype.hasOwnProperty.call(campaign, "hasRegulatoryIssues") ? campaign.hasRegulatoryIssues : existing.has_regulatory_issues,
        Object.prototype.hasOwnProperty.call(campaign, "regulatoryIssuesDescription") ? campaign.regulatoryIssuesDescription : existing.regulatory_issues_description,
        Object.prototype.hasOwnProperty.call(campaign, "isInGoodLegalStanding") ? campaign.isInGoodLegalStanding : existing.is_in_good_legal_standing,
        id,
      ]
    );

    if (campaign.investmentTag && Array.isArray(campaign.investmentTag)) {
      await handleTagMappings(id, campaign.investmentTag);
    }

    const auditOldValues: Record<string, any> = {
      name: existing.name,
      description: existing.description,
      stage: existing.stage,
      is_active: existing.is_active,
      target: existing.target,
      minimum_investment: existing.minimum_investment,
      property: existing.property,
      contact_info_email_address: existing.contact_info_email_address,
      meta_title: existing.meta_title,
      meta_description: existing.meta_description,
      featured_investment: existing.featured_investment,
      is_part_of_fund: existing.is_part_of_fund,
    };
    const auditNewValues: Record<string, any> = {
      name: campaign.name || existing.name,
      description: campaign.description ?? existing.description,
      stage: finalStage ?? existing.stage,
      is_active: finalIsActive ?? existing.is_active,
      target: campaign.target ?? existing.target,
      minimum_investment: finalMinimumInvestment ?? existing.minimum_investment,
      property: finalProperty ?? existing.property,
      contact_info_email_address: campaign.contactInfoEmailAddress ?? existing.contact_info_email_address,
      meta_title: campaign.metaTitle ?? existing.meta_title,
      meta_description: campaign.metaDescription ?? existing.meta_description,
      featured_investment: campaign.featuredInvestment ?? existing.featured_investment,
      is_part_of_fund: campaign.isPartOfFund ?? existing.is_part_of_fund,
    };

    await logAudit({
      tableName: "campaigns",
      recordId: String(id),
      actionType: "Modified",
      oldValues: auditOldValues,
      newValues: auditNewValues,
      updatedBy: req.user?.id || null,
    });

    if (
      campaign.note || campaign.Note ||
      (campaign.oldStatus && campaign.newStatus) ||
      (campaign.OldStatus && campaign.NewStatus)
    ) {
      const loginUserId = req.user?.id || null;
      const noteText = (campaign.note || campaign.Note || "").trim() || null;
      const oldStatus = campaign.oldStatus || campaign.OldStatus || null;
      const newStatus = campaign.newStatus || campaign.NewStatus || null;

      await pool.query(
        `INSERT INTO investment_notes (campaign_id, note, created_by, created_at, old_status, new_status)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [id, noteText, loginUserId, oldStatus, newStatus]
      );
    }

    if (campaign.noteEmail && Array.isArray(campaign.noteEmail) && campaign.noteEmail.length > 0) {
      const loggedInUserName = req.user?.name || "";
      const investmentName = campaign.name || existing.name || "";
      const fromStage = campaign.oldStatus || campaign.OldStatus || null;
      const toStage = campaign.newStatus || campaign.NewStatus || null;
      const noteText = (campaign.note || campaign.Note || "").trim() || null;

      const stageChangeSection = (!fromStage || !toStage) ? "" :
        `<tr><td style='padding:6px 0; font-weight:bold;'>Stage Change:</td><td style='padding:6px 0;'>${fromStage} → ${toStage}</td></tr>`;

      const logoUrl = process.env.LOGO_URL || "";
      const uniqueEmails = [...new Set(campaign.noteEmail)] as string[];

      for (const email of uniqueEmails) {
        if (!email) continue;
        try {
          await sendTemplateEmail(19, email, {
            logoUrl,
            loggedInUserName,
            investmentName,
            noteText: noteText || "",
            stageChangeSection,
          });
        } catch (emailErr: any) {
          console.error("Error sending mention email:", emailErr);
        }
      }
    }

    const notesResult = await pool.query(
      `SELECT n.id, n.old_status, n.new_status, n.note, n.created_at, u.user_name
       FROM investment_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.campaign_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    const investmentNotes = notesResult.rows.map((n: any) => ({
      date: n.created_at ? dayjs.utc(n.created_at).format("MM/DD/YYYY") : "",
      userName: n.user_name || "",
      note: n.note || "",
      oldStatus: n.old_status || null,
      newStatus: n.new_status || null,
    }));

    const updatedResult = await pool.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    const updatedCampaign = updatedResult.rows[0];

    const tagResult = await pool.query(
      `SELECT it.tag
       FROM investment_tag_mappings itm
       JOIN investment_tags it ON itm.tag_id = it.id
       WHERE itm.campaign_id = $1`,
      [id]
    );
    const investmentTag = tagResult.rows.map((t: any) => ({ tag: t.tag }));

    res.json({
      success: true,
      message: "Campaign details updated successfully",
      campaign: {
        ...mapCampaignRow(updatedCampaign),
        investmentNotes,
        investmentTag,
      },
    });
  } catch (err: any) {
    console.error("Error updating investment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const loginUserId = req.user?.id || null;

    const campaignResult = await pool.query(`SELECT id FROM campaigns WHERE id = $1`, [id]);
    if (campaignResult.rows.length === 0) {
      res.json({ success: false, message: "Campaign not found." });
      return;
    }

    const now = new Date().toISOString();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const pgResult = await client.query(
        `SELECT id FROM pending_grants WHERE campaign_id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
        [id]
      );
      const pendingGrantIds = pgResult.rows.map((r: any) => r.id);

      const assetResult = await client.query(
        `SELECT id FROM asset_based_payment_requests WHERE campaign_id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
        [id]
      );
      const assetIds = assetResult.rows.map((r: any) => r.id);

      const rmResult = await client.query(
        `SELECT id FROM return_masters WHERE campaign_id = $1`,
        [id]
      );
      const returnMasterIds = rmResult.rows.map((r: any) => r.id);

      const logConditions: string[] = [];
      const logParams: any[] = [now, loginUserId];
      let pIdx = 3;

      logParams.push(id);
      logConditions.push(`campaign_id = $${pIdx++}`);

      if (assetIds.length > 0) {
        logParams.push(assetIds);
        logConditions.push(`asset_based_payment_request_id = ANY($${pIdx++})`);
      }
      if (pendingGrantIds.length > 0) {
        logParams.push(pendingGrantIds);
        logConditions.push(`pending_grants_id = ANY($${pIdx++})`);
      }

      await client.query(
        `UPDATE account_balance_change_logs SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE (${logConditions.join(" OR ")}) AND (is_deleted IS NULL OR is_deleted = false)`,
        logParams
      );

      if (pendingGrantIds.length > 0) {
        await client.query(
          `UPDATE scheduled_email_logs SET is_deleted = true, deleted_at = $1, deleted_by = $2
           WHERE pending_grant_id = ANY($3) AND (is_deleted IS NULL OR is_deleted = false)`,
          [now, loginUserId, pendingGrantIds]
        );

        await client.query(
          `UPDATE recommendations SET is_deleted = true, deleted_at = $1, deleted_by = $2
           WHERE pending_grants_id = ANY($3) AND (is_deleted IS NULL OR is_deleted = false)`,
          [now, loginUserId, pendingGrantIds]
        );
      }

      if (returnMasterIds.length > 0) {
        await client.query(
          `UPDATE return_details SET is_deleted = true, deleted_at = $1, deleted_by = $2
           WHERE return_master_id = ANY($3) AND (is_deleted IS NULL OR is_deleted = false)`,
          [now, loginUserId, returnMasterIds]
        );
      }

      await client.query(
        `UPDATE asset_based_payment_requests SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE campaign_id = $3 AND (is_deleted IS NULL OR is_deleted = false)`,
        [now, loginUserId, id]
      );

      await client.query(
        `UPDATE user_investments SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE campaign_id = $3 AND (is_deleted IS NULL OR is_deleted = false)`,
        [now, loginUserId, id]
      );

      await client.query(
        `UPDATE recommendations SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE campaign_id = $3 AND (is_deleted IS NULL OR is_deleted = false)`,
        [now, loginUserId, id]
      );

      await client.query(
        `UPDATE pending_grants SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE campaign_id = $3 AND (is_deleted IS NULL OR is_deleted = false)`,
        [now, loginUserId, id]
      );

      await client.query(
        `UPDATE disbursal_requests SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE campaign_id = $3 AND (is_deleted IS NULL OR is_deleted = false)`,
        [now, loginUserId, id]
      );

      await client.query(
        `UPDATE completed_investment_details SET is_deleted = true, deleted_at = $1, deleted_by = $2
         WHERE campaign_id = $3 AND (is_deleted IS NULL OR is_deleted = false)`,
        [now, loginUserId, id]
      );

      await client.query(
        `UPDATE campaigns SET is_deleted = true, deleted_at = $1, deleted_by = $2 WHERE id = $3`,
        [now, loginUserId, id]
      );

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit({
      tableName: "campaigns",
      recordId: String(id),
      actionType: "Deleted",
      oldValues: { id },
      updatedBy: loginUserId,
    });

    res.json({ success: true, message: "Campaign deleted successfully." });
  } catch (err: any) {
    console.error("Error deleting investment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:id/clone", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const name = (String(req.query.name || "")).trim();

    if (name) {
      const nameExists = await pool.query(
        `SELECT id FROM campaigns WHERE TRIM(name) = $1 LIMIT 1`,
        [name]
      );
      if (nameExists.rows.length > 0) {
        res.json({ success: false, message: "Campaign name already exists." });
        return;
      }
    }

    const campaignResult = await pool.query(
      `SELECT * FROM campaigns WHERE id = $1`,
      [id]
    );

    if (campaignResult.rows.length === 0) {
      res.json({ success: false, message: "Campaign not found." });
      return;
    }

    const c = campaignResult.rows[0];

    const baseProp = (name || "").toLowerCase().replace(/\s/g, "");
    let updatedProperty = `${baseProp}-qbe-${new Date().getFullYear()}`;

    let counter = 1;
    let propExists = await pool.query(`SELECT id FROM campaigns WHERE property = $1`, [updatedProperty]);
    while (propExists.rows.length > 0) {
      updatedProperty = `${baseProp}-qbe-${new Date().getFullYear()}-${counter}`;
      counter++;
      propExists = await pool.query(`SELECT id FROM campaigns WHERE property = $1`, [updatedProperty]);
    }

    const cloneResult = await pool.query(
      `INSERT INTO campaigns (
        name, description, themes, approved_by, sdgs, investment_instruments, terms,
        minimum_investment, website, network_description, contact_info_full_name,
        contact_info_address, contact_info_address_2, contact_info_phone_number,
        country, other_country_address, city, state, zip_code,
        impact_assets_funding_status, investment_role, referred_to_catacap,
        target, status, tile_image_file_name, image_file_name, pdf_file_name,
        original_pdf_file_name, logo_file_name, is_active, stage, property,
        added_total_admin_raised, email_sends, fundraising_close_date,
        mission_and_vision, personalized_thank_you, has_existing_investors,
        expected_total, created_date, modified_date
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,NOW(),NOW()
      ) RETURNING id`,
      [
        name || c.name,
        c.description,
        c.themes,
        c.approved_by,
        c.sdgs,
        c.investment_instruments,
        c.terms,
        c.minimum_investment,
        c.website,
        c.network_description,
        c.contact_info_full_name,
        c.contact_info_address,
        c.contact_info_address_2,
        c.contact_info_phone_number,
        c.country,
        c.other_country_address,
        c.city,
        c.state,
        c.zip_code,
        c.impact_assets_funding_status,
        c.investment_role,
        c.referred_to_catacap,
        c.target,
        "0",
        c.tile_image_file_name,
        c.image_file_name,
        c.pdf_file_name,
        c.original_pdf_file_name,
        c.logo_file_name,
        false,
        InvestmentStageEnum.New,
        updatedProperty,
        0,
        false,
        c.fundraising_close_date,
        c.mission_and_vision,
        c.personalized_thank_you,
        c.has_existing_investors,
        c.expected_total,
      ]
    );

    const clonedId = cloneResult.rows[0]?.id;
    await logAudit({
      tableName: "campaigns",
      recordId: String(clonedId || id),
      actionType: "Created",
      oldValues: null,
      newValues: { cloned_from: id, name: name || c.name },
      updatedBy: req.user?.id || null,
    });

    res.json({ success: true, message: "Investment cloned successfully." });
  } catch (err: any) {
    console.error("Error cloning investment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

function mapCampaignRow(c: any): any {
  return {
    id: Number(c.id),
    name: c.name,
    description: c.description,
    themes: c.themes,
    approvedBy: c.approved_by,
    sdGs: c.sdgs,
    investmentTypes: c.investment_instruments,
    terms: c.terms,
    minimumInvestment: c.minimum_investment,
    website: c.website,
    contactInfoFullName: c.contact_info_full_name,
    contactInfoAddress: c.contact_info_address,
    contactInfoAddress2: c.contact_info_address_2,
    contactInfoEmailAddress: c.contact_info_email_address,
    investmentInformationalEmail: c.investment_informational_email,
    contactInfoPhoneNumber: c.contact_info_phone_number,
    country: c.country,
    city: c.city,
    state: c.state,
    zipCode: c.zip_code,
    otherCountryAddress: c.other_country_address,
    impactAssetsFundingStatus: c.impact_assets_funding_status,
    investmentRole: c.investment_role,
    referredToCataCap: c.referred_to_catacap,
    target: c.target,
    status: c.status,
    tileImageFileName: resolveFileUrl(c.tile_image_file_name, "campaigns"),
    imageFileName: resolveFileUrl(c.image_file_name, "campaigns"),
    pdfFileName: resolveFileUrl(c.pdf_file_name, "campaigns"),
    originalPdfFileName: c.original_pdf_file_name || null,
    logoFileName: resolveFileUrl(c.logo_file_name, "campaigns"),
    isActive: c.is_active,
    isPartOfFund: c.is_part_of_fund || false,
    associatedFundId: c.associated_fund_id,
    stage: c.stage,
    property: c.property,
    addedTotalAdminRaised: c.added_total_admin_raised,
    emailSends: c.email_sends,
    fundraisingCloseDate: c.fundraising_close_date,
    missionAndVision: c.mission_and_vision,
    personalizedThankYou: c.personalized_thank_you,
    hasCorporateBankAccount: c.has_corporate_bank_account,
    hasPersonalFinancialBenefit: c.has_personal_financial_benefit,
    personalFinancialBenefitDescription: c.personal_financial_benefit_description,
    hasRegulatoryIssues: c.has_regulatory_issues,
    regulatoryIssuesDescription: c.regulatory_issues_description,
    isInGoodLegalStanding: c.is_in_good_legal_standing,
    expectedTotal: c.expected_total ? parseFloat(c.expected_total) : null,
    featuredInvestment: c.featured_investment || false,
    createdDate: c.created_date,
    modifiedDate: c.modified_date,
    investmentTypeCategory: c.investment_type_category,
    equityValuation: c.equity_valuation ? parseFloat(c.equity_valuation) : null,
    equitySecurityType: c.equity_security_type,
    fundTerm: c.fund_term,
    equityTargetReturn: c.equity_target_return ? parseFloat(c.equity_target_return) : null,
    debtPaymentFrequency: c.debt_payment_frequency,
    debtMaturityDate: c.debt_maturity_date,
    debtInterestRate: c.debt_interest_rate ? parseFloat(c.debt_interest_rate) : null,
    metaTitle: c.meta_title,
    metaDescription: c.meta_description,
  };
}

async function handleTagMappings(campaignId: number, investmentTags: any[]): Promise<void> {
  const tagNames = investmentTags
    .map((t: any) => (typeof t === "string" ? t : t.tag || "").trim())
    .filter((t: string) => t.length > 0);

  if (tagNames.length === 0) {
    await pool.query(`DELETE FROM investment_tag_mappings WHERE campaign_id = $1`, [campaignId]);
    return;
  }

  for (const tagName of tagNames) {
    const existing = await pool.query(
      `SELECT id FROM investment_tags WHERE LOWER(TRIM(tag)) = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [tagName.toLowerCase()]
    );
    if (existing.rows.length === 0) {
      await pool.query(`INSERT INTO investment_tags (tag) VALUES ($1)`, [tagName]);
    }
  }

  const allTagsResult = await pool.query(
    `SELECT id, tag FROM investment_tags WHERE (is_deleted IS NULL OR is_deleted = false)`
  );
  const allTags = allTagsResult.rows;

  const tagNameLowerSet = new Set(tagNames.map((t: string) => t.toLowerCase()));
  const matchingTagIds = allTags
    .filter((t: any) => tagNameLowerSet.has(t.tag.trim().toLowerCase()))
    .map((t: any) => Number(t.id));

  await pool.query(`DELETE FROM investment_tag_mappings WHERE campaign_id = $1`, [campaignId]);

  for (const tagId of matchingTagIds) {
    await pool.query(
      `INSERT INTO investment_tag_mappings (tag_id, campaign_id) VALUES ($1, $2)`,
      [tagId, campaignId]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Investment Updates ("Updates" tab on the Investment edit page)
// Schema lives in releases/23_04_2026/migrations/2026_04_23_campaign_updates.sql
// ─────────────────────────────────────────────────────────────────────────────

function truncate(text: string | null | undefined, max = 240): string {
  if (!text) return "";
  const plain = String(text).replace(/<[^>]+>/g, "").trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max - 1) + "…";
}

async function getCampaignForUpdates(campaignId: number): Promise<any | null> {
  const result = await pool.query(
    `SELECT id, name, stage, property, image_file_name, tile_image_file_name,
            user_id, contact_info_email_address, investment_informational_email
     FROM campaigns WHERE id = $1 LIMIT 1`,
    [campaignId]
  );
  return result.rows[0] || null;
}

router.get("/:id/updates", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(campaignId)) {
      res.status(400).json({ success: false, message: "Invalid investment id." });
      return;
    }

    const result = await pool.query(
      `SELECT id, campaign_id AS "campaignId", subject, description,
              short_subject AS "shortSubject", short_description AS "shortDescription",
              attach_file AS "attachFile", attach_file_name AS "attachFileName",
              start_date AS "startDate",
              end_date AS "endDate", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM campaign_updates
       WHERE campaign_id = $1 AND (is_deleted IS NULL OR is_deleted = false)
       ORDER BY id DESC`,
      [campaignId]
    );

    const items = result.rows.map((r: any) => ({
      ...r,
      attachFileUrl: r.attachFile ? resolveFileUrl(r.attachFile, "campaigns") : null,
    }));

    res.json({ success: true, items });
  } catch (err: any) {
    console.error("Error fetching campaign updates:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:id/updates", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(campaignId)) {
      res.status(400).json({ success: false, message: "Invalid investment id." });
      return;
    }

    const campaign = await getCampaignForUpdates(campaignId);
    if (!campaign) {
      res.status(404).json({ success: false, message: "Investment not found." });
      return;
    }
    if (Number(campaign.stage) === InvestmentStageEnum.ClosedNotInvested) {
      res
        .status(400)
        .json({
          success: false,
          message: "Updates are not available for investments that are Closed - Not Invested.",
        });
      return;
    }

    const { subject, description, shortSubject, shortDescription, startDate, endDate, attachFile, attachFileName } =
      req.body || {};
    if (!subject || !String(subject).trim()) {
      res.status(400).json({ success: false, message: "Subject is required." });
      return;
    }
    if (!description || !String(description).replace(/<[^>]+>/g, "").trim()) {
      res.status(400).json({ success: false, message: "Description is required." });
      return;
    }

    // attachFile may be a data URL (new upload), an existing storage path, an
    // object { data, name } when the client sends the original filename, or
    // null/empty to clear the attachment.
    let attachFilePath: string | null = null;
    let storedAttachFileName: string | null = null;
    let attachPayload: any = attachFile;
    if (attachPayload && typeof attachPayload === "object" && !Array.isArray(attachPayload)) {
      storedAttachFileName = attachPayload.name ? String(attachPayload.name).trim() : null;
      attachPayload = attachPayload.data;
    }
    if (attachPayload && typeof attachPayload === "string") {
      if (attachPayload.startsWith("data:")) {
        const uploaded = await uploadBase64Image(attachPayload, "campaigns");
        attachFilePath = uploaded.filePath;
      } else if (attachPayload.trim() !== "") {
        attachFilePath = attachPayload.trim();
      }
    }
    if (!storedAttachFileName && attachFileName) {
      storedAttachFileName = String(attachFileName).trim() || null;
    }

    const finalShortSubject = (shortSubject && String(shortSubject).trim()) || String(subject).trim();
    const finalShortDescription =
      (shortDescription && String(shortDescription).trim()) || truncate(description, 240);

    const insertResult = await pool.query(
      `INSERT INTO campaign_updates (campaign_id, subject, description, short_subject, short_description, attach_file, attach_file_name, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, campaign_id AS "campaignId", subject, description,
                 short_subject AS "shortSubject", short_description AS "shortDescription",
                 attach_file AS "attachFile", attach_file_name AS "attachFileName",
                 start_date AS "startDate",
                 end_date AS "endDate", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        campaignId,
        String(subject).trim(),
        description || null,
        finalShortSubject,
        finalShortDescription,
        attachFilePath,
        storedAttachFileName,
        startDate || null,
        endDate || null,
      ]
    );
    const created = insertResult.rows[0];

    // Defer notification fan-out until the start_date is reached. If start_date
    // is null or in the past/today, fire immediately; otherwise the daily
    // CampaignUpdateNotifications scheduler job will fire on/after start_date.
    const startDateValue = created.startDate ? new Date(created.startDate) : null;
    const shouldFireNow = !startDateValue || startDateValue <= new Date();
    if (shouldFireNow) try {
      const investorsResult = await pool.query(
        `SELECT DISTINCT ui.user_id
         FROM user_investments ui
         WHERE ui.campaign_id = $1
           AND ui.user_id IS NOT NULL
           AND (ui.is_deleted IS NULL OR ui.is_deleted = false)`,
        [campaignId]
      );

      const redirectUrl = `/investments/${campaign.property || campaign.id}`;
      const notifTitle = created.shortSubject || created.subject;
      const notifDescription = created.shortDescription || truncate(created.description, 240);
      const notifPicture =
        campaign.image_file_name || campaign.tile_image_file_name || null;

      for (const row of investorsResult.rows) {
        try {
          await pool.query(
            `INSERT INTO user_notifications (title, description, url_to_redirect, is_read, target_user_id, picture_file_name)
             VALUES ($1, $2, $3, false, $4, $5)`,
            [notifTitle, notifDescription, redirectUrl, row.user_id, notifPicture]
          );
        } catch (notifErr) {
          console.error(
            `Failed to create campaign-update notification for user ${row.user_id}:`,
            notifErr
          );
        }
      }
      await pool.query(
        `UPDATE campaign_updates SET notifications_sent_at = NOW() WHERE id = $1`,
        [created.id]
      );
    } catch (fanOutErr) {
      console.error("Campaign update notification fan-out failed:", fanOutErr);
    }

    res.json({
      success: true,
      message: "Update created successfully.",
      item: {
        ...created,
        attachFileUrl: created.attachFile
          ? resolveFileUrl(created.attachFile, "campaigns")
          : null,
      },
    });
  } catch (err: any) {
    console.error("Error creating campaign update:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/:id/updates/:updateId", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(String(req.params.id), 10);
    const updateId = parseInt(String(req.params.updateId), 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(updateId)) {
      res.status(400).json({ success: false, message: "Invalid id." });
      return;
    }

    const existingResult = await pool.query(
      `SELECT id, attach_file, attach_file_name FROM campaign_updates
       WHERE id = $1 AND campaign_id = $2 AND (is_deleted IS NULL OR is_deleted = false)`,
      [updateId, campaignId]
    );
    if (existingResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "Update not found." });
      return;
    }
    const existing = existingResult.rows[0];

    const { subject, description, shortSubject, shortDescription, startDate, endDate, attachFile, attachFileName } =
      req.body || {};
    if (!subject || !String(subject).trim()) {
      res.status(400).json({ success: false, message: "Subject is required." });
      return;
    }
    if (!description || !String(description).replace(/<[^>]+>/g, "").trim()) {
      res.status(400).json({ success: false, message: "Description is required." });
      return;
    }

    let attachFilePath: string | null = existing.attach_file || null;
    let storedAttachFileName: string | null = existing.attach_file_name || null;
    let attachPayload: any = attachFile;
    let providedFileName: string | null = null;
    if (attachPayload && typeof attachPayload === "object" && !Array.isArray(attachPayload)) {
      providedFileName = attachPayload.name ? String(attachPayload.name).trim() : null;
      attachPayload = attachPayload.data;
    }
    if (attachPayload === null || attachPayload === "") {
      attachFilePath = null;
      storedAttachFileName = null;
    } else if (typeof attachPayload === "string" && attachPayload.startsWith("data:")) {
      const uploaded = await uploadBase64Image(attachPayload, "campaigns");
      attachFilePath = uploaded.filePath;
      storedAttachFileName = providedFileName || (attachFileName ? String(attachFileName).trim() : null);
    } else if (typeof attachPayload === "string" && attachPayload.trim() !== "") {
      attachFilePath = attachPayload.trim();
      if (providedFileName || attachFileName) {
        storedAttachFileName = providedFileName || String(attachFileName).trim();
      }
    }

    const finalShortSubject = (shortSubject && String(shortSubject).trim()) || String(subject).trim();
    const finalShortDescription =
      (shortDescription && String(shortDescription).trim()) || truncate(description, 240);

    const updateResult = await pool.query(
      `UPDATE campaign_updates
         SET subject = $1, description = $2, short_subject = $3, short_description = $4,
             attach_file = $5, attach_file_name = $6, start_date = $7, end_date = $8, updated_at = NOW()
       WHERE id = $9 AND campaign_id = $10
       RETURNING id, campaign_id AS "campaignId", subject, description,
                 short_subject AS "shortSubject", short_description AS "shortDescription",
                 attach_file AS "attachFile", attach_file_name AS "attachFileName",
                 start_date AS "startDate",
                 end_date AS "endDate", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        String(subject).trim(),
        description || null,
        finalShortSubject,
        finalShortDescription,
        attachFilePath,
        storedAttachFileName,
        startDate || null,
        endDate || null,
        updateId,
        campaignId,
      ]
    );
    const updated = updateResult.rows[0];

    res.json({
      success: true,
      message: "Update saved successfully.",
      item: {
        ...updated,
        attachFileUrl: updated.attachFile
          ? resolveFileUrl(updated.attachFile, "campaigns")
          : null,
      },
    });
  } catch (err: any) {
    console.error("Error updating campaign update:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cleans up rich-text description HTML from the contentEditable editor so it
// renders consistently in email clients (Gmail/Outlook strip Tailwind CSS
// custom properties like `--tw-*` and frequently drop relative font-weight
// values such as `bolder`, which is why only the first bold span shows up).
function sanitizeDescriptionForEmail(html: string): string {
  if (!html) return "";
  return String(html).replace(/style\s*=\s*"([^"]*)"/gi, (_m, styleBody) => {
    const cleaned = styleBody
      .split(";")
      .map((decl: string) => decl.trim())
      .filter((decl: string) => decl.length > 0 && !decl.startsWith("--tw-"))
      .map((decl: string) => decl.replace(/font-weight\s*:\s*bolder/i, "font-weight: 700"))
      .join("; ");
    return cleaned ? `style="${cleaned}"` : "";
  });
}

// Build the rendered email HTML + subject for an Investment Update. Used by
// both the preview and send endpoints so what the admin sees matches what
// investors receive (per-investor `firstName` is filled in at send time).
async function buildInvestmentUpdateEmail(
  campaign: any,
  update: any
): Promise<{ subject: string; bodyHtml: string; campaignUrl: string; ccList: string[] } | null> {
  const tplResult = await pool.query(
    `SELECT subject, body_html
     FROM email_templates
     WHERE name = 'Investment Update Notification'
       AND status = 2 AND (is_deleted IS NULL OR is_deleted = false)
     LIMIT 1`
  );
  if (tplResult.rows.length === 0) return null;
  const template = tplResult.rows[0];

  const frontendBase = (process.env.VITE_FRONTEND_URL || process.env.FRONTEND_URL || "https://catacap.org").replace(/\/+$/, "");
  const campaignUrl = `${frontendBase}/investments/${campaign.property || campaign.id}`;

  const subject = String(template.subject || "")
    .replace(/\{\{campaignName\}\}/g, campaign.name || "")
    .replace(/\{\{updateSubject\}\}/g, update.subject || "");
  // The previous template embedded an inline image at the top of the email
  // body. We now send the file as a real email attachment instead, so the
  // {{updateImageHtml}} placeholder is always replaced with an empty string.
  const bodyHtml = String(template.body_html || "")
    .replace(/\{\{campaignName\}\}/g, campaign.name || "")
    .replace(/\{\{updateSubject\}\}/g, update.subject || "")
    .replace(/\{\{updateDescription\}\}/g, sanitizeDescriptionForEmail(update.description || ""))
    .replace(/\{\{updateImageHtml\}\}/g, "");

  // Spec: CC is the single Investment Owner email. Prefer the owning user's
  // account email; fall back to the contact_info / informational email only
  // when no owner user is set, so we never CC more than one address.
  let ownerEmail: string | null = null;
  if (campaign.user_id) {
    try {
      const ownerResult = await pool.query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [campaign.user_id]
      );
      const candidate = ownerResult.rows[0]?.email;
      if (candidate && String(candidate).includes("@")) {
        ownerEmail = String(candidate).trim();
      }
    } catch (ownerErr) {
      console.error("Failed to fetch investment owner email for CC:", ownerErr);
    }
  }
  if (!ownerEmail && campaign.contact_info_email_address && String(campaign.contact_info_email_address).includes("@")) {
    ownerEmail = String(campaign.contact_info_email_address).trim();
  }
  if (!ownerEmail && campaign.investment_informational_email && String(campaign.investment_informational_email).includes("@")) {
    ownerEmail = String(campaign.investment_informational_email).trim();
  }
  return { subject, bodyHtml, campaignUrl, ccList: ownerEmail ? [ownerEmail] : [] };
}

// Returns a rendered preview of the "Investment Update Notification" email so
// the admin can review it before clicking Send.
router.get("/:id/updates/:updateId/email-preview", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(String(req.params.id), 10);
    const updateId = parseInt(String(req.params.updateId), 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(updateId)) {
      res.status(400).json({ success: false, message: "Invalid id." });
      return;
    }
    const campaign = await getCampaignForUpdates(campaignId);
    if (!campaign) {
      res.status(404).json({ success: false, message: "Investment not found." });
      return;
    }
    const updateRow = await pool.query(
      `SELECT id, subject, description, attach_file
       FROM campaign_updates
       WHERE id = $1 AND campaign_id = $2 AND (is_deleted IS NULL OR is_deleted = false)
       LIMIT 1`,
      [updateId, campaignId]
    );
    if (updateRow.rows.length === 0) {
      res.status(404).json({ success: false, message: "Update not found." });
      return;
    }

    const built = await buildInvestmentUpdateEmail(campaign, updateRow.rows[0]);
    if (!built) {
      res.status(500).json({ success: false, message: "Email template 'Investment Update Notification' is missing." });
      return;
    }

    const investorsCount = await pool.query(
      `SELECT COUNT(DISTINCT ui.user_id)::int AS count
         FROM user_investments ui
         JOIN users u ON u.id = ui.user_id
        WHERE ui.campaign_id = $1
          AND ui.user_id IS NOT NULL
          AND (ui.is_deleted IS NULL OR ui.is_deleted = false)
          AND u.email IS NOT NULL AND u.email <> ''
          AND (u.opt_out_email_notifications IS NULL OR u.opt_out_email_notifications = false)`,
      [campaignId]
    );

    const cfgResult = await pool.query(
      `SELECT key, value FROM site_configurations WHERE key IN ('defaultFromAddress', 'defaultEmailSenderName')`
    );
    const cfg: Record<string, string> = {};
    for (const r of cfgResult.rows) cfg[r.key] = (r.value || "").trim();
    const fromHeader = `${cfg.defaultEmailSenderName || "CataCap Support"} <${cfg.defaultFromAddress || "support@catacap.org"}>`;

    res.json({
      success: true,
      subject: built.subject.replace(/\{\{firstName\}\}/g, "{first name}"),
      bodyHtml: built.bodyHtml.replace(/\{\{firstName\}\}/g, "there"),
      from: fromHeader,
      cc: built.ccList,
      recipientCount: investorsCount.rows[0]?.count || 0,
    });
  } catch (err: any) {
    console.error("Error building campaign update email preview:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Send the "Investment Update Notification" email to all investors of this
// campaign with the Investment Owner CC'd. Uses the Resend client directly
// (not sendTemplateEmail) so we can override sender + add CC for this flow.
router.post("/:id/updates/:updateId/send-email", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(String(req.params.id), 10);
    const updateId = parseInt(String(req.params.updateId), 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(updateId)) {
      res.status(400).json({ success: false, message: "Invalid id." });
      return;
    }

    const campaign = await getCampaignForUpdates(campaignId);
    if (!campaign) {
      res.status(404).json({ success: false, message: "Investment not found." });
      return;
    }

    const updateRow = await pool.query(
      `SELECT id, subject, description, attach_file
       FROM campaign_updates
       WHERE id = $1 AND campaign_id = $2 AND (is_deleted IS NULL OR is_deleted = false)
       LIMIT 1`,
      [updateId, campaignId]
    );
    if (updateRow.rows.length === 0) {
      res.status(404).json({ success: false, message: "Update not found." });
      return;
    }
    const update = updateRow.rows[0];

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        success: false,
        message: "Email service is not configured (RESEND_API_KEY missing).",
      });
      return;
    }

    const built = await buildInvestmentUpdateEmail(campaign, update);
    if (!built) {
      res.status(500).json({
        success: false,
        message: "Email template 'Investment Update Notification' is missing.",
      });
      return;
    }

    const cfgResult = await pool.query(
      `SELECT key, value FROM site_configurations
       WHERE key IN ('defaultFromAddress', 'defaultEmailSenderName')`
    );
    const cfg: Record<string, string> = {};
    for (const r of cfgResult.rows) cfg[r.key] = (r.value || "").trim();
    const fromAddress = cfg.defaultFromAddress || "support@catacap.org";
    const senderName = cfg.defaultEmailSenderName || "CataCap Support";
    const fromHeader = `${senderName} <${fromAddress}>`;
    const ccList = built.ccList;

    const investorsResult = await pool.query(
      `SELECT DISTINCT u.id, u.email, COALESCE(u.first_name, '') AS first_name
       FROM user_investments ui
       JOIN users u ON u.id = ui.user_id
       WHERE ui.campaign_id = $1
         AND ui.user_id IS NOT NULL
         AND (ui.is_deleted IS NULL OR ui.is_deleted = false)
         AND u.email IS NOT NULL
         AND u.email <> ''
         AND (u.opt_out_email_notifications IS NULL OR u.opt_out_email_notifications = false)`,
      [campaignId]
    );

    const resend = new Resend(apiKey);
    const baseSubject = built.subject;
    const baseBody = built.bodyHtml.replace(/\{\{campaignUrl\}\}/g, built.campaignUrl);

    // Fetch the attached file (PDF/DOC/image/etc.) once so it can be sent as a
    // real email attachment to every recipient, instead of being inlined in
    // the HTML body.
    let attachments: { filename: string; content: string }[] | undefined;
    if (update.attach_file) {
      try {
        const fileUrl = resolveFileUrl(update.attach_file, "campaigns");
        if (fileUrl) {
          const fetchRes = await fetch(fileUrl);
          if (fetchRes.ok) {
            const buf = Buffer.from(await fetchRes.arrayBuffer());
            const fallbackName = String(update.attach_file).split("/").pop() || "attachment";
            const filename = (update.attach_file_name && String(update.attach_file_name).trim()) || fallbackName;
            attachments = [{ filename, content: buf.toString("base64") }];
          } else {
            console.error(`[EMAIL] Failed to fetch attachment ${fileUrl}: HTTP ${fetchRes.status}`);
          }
        }
      } catch (attachErr) {
        console.error("[EMAIL] Failed to load attachment for campaign update email:", attachErr);
      }
    }

    const testOverride = process.env.TEST_EMAIL_OVERRIDE;
    let sent = 0;
    let failed = 0;

    for (const inv of investorsResult.rows) {
      const recipient = testOverride || inv.email;
      const subject = testOverride
        ? `[TEST] ${baseSubject} (Original recipient: ${inv.email})`
        : baseSubject;
      const body = baseBody.replace(/\{\{firstName\}\}/g, inv.first_name || "there");
      try {
        const { error } = await resend.emails.send({
          from: fromHeader,
          to: [recipient],
          cc: ccList.length > 0 ? ccList : undefined,
          subject,
          html: body,
          attachments,
        });
        if (error) {
          failed++;
          console.error(`[EMAIL] Resend error for investor ${inv.id}:`, error);
        } else {
          sent++;
        }
      } catch (sendErr) {
        failed++;
        console.error(`[EMAIL] Failed sending update email to ${recipient}:`, sendErr);
      }
    }

    res.json({
      success: true,
      message: `Email sent to ${sent} investor(s)${failed ? `, ${failed} failed` : ""}.`,
      sent,
      failed,
      ccCount: ccList.length,
    });
  } catch (err: any) {
    console.error("Error sending campaign update email:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id/updates/:updateId", async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(String(req.params.id), 10);
    const updateId = parseInt(String(req.params.updateId), 10);
    if (!Number.isFinite(campaignId) || !Number.isFinite(updateId)) {
      res.status(400).json({ success: false, message: "Invalid id." });
      return;
    }

    const result = await pool.query(
      `UPDATE campaign_updates
         SET is_deleted = true, updated_at = NOW()
       WHERE id = $1 AND campaign_id = $2 AND (is_deleted IS NULL OR is_deleted = false)
       RETURNING id`,
      [updateId, campaignId]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: "Update not found." });
      return;
    }

    res.json({ success: true, message: "Update deleted successfully." });
  } catch (err: any) {
    console.error("Error deleting campaign update:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
