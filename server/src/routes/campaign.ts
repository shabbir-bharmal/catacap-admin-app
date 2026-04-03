import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { jwtUserAuthMiddleware } from "../middleware/jwtUserAuth.js";
import { parsePagination } from "../utils/softDelete.js";
import ExcelJS from "exceljs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { sendTemplateEmail } from "../utils/emailService.js";

const router = Router();

const STAGE_CLOSED_NOT_INVESTED = 4;
const STAGE_CLOSED_INVESTED = 3;

const UPLOADS_DIR = path.resolve(process.cwd(), "server", "uploads");

const DisbursalRequestStatusMap: Record<number, string> = {
  1: "Pending",
  2: "Completed",
};

function getStatusName(status: number): string {
  return DisbursalRequestStatusMap[status] || "Unknown";
}

function formatDate(dateVal: any): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function formatDateSlash(dateVal: any): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatAmount(amount: any): string {
  const num = parseFloat(amount) || 0;
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function buildInvestmentTypeMap(rows: any[]): Promise<Record<number, string>> {
  const allIds = new Set<number>();
  for (const row of rows) {
    if (row.investment_types) {
      const ids = row.investment_types
        .split(",")
        .map((s: string) => parseInt(s.trim(), 10))
        .filter((n: number) => !isNaN(n));
      for (const id of ids) allIds.add(id);
    }
  }
  if (allIds.size === 0) return {};

  const idArr = Array.from(allIds);
  const placeholders = idArr.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `SELECT id, name FROM investment_types WHERE id IN (${placeholders})`,
    idArr
  );
  const map: Record<number, string> = {};
  for (const row of result.rows) {
    map[row.id] = row.name;
  }
  return map;
}

function resolveInvestmentTypeString(investmentTypes: string | null | undefined, typeMap: Record<number, string>): string {
  if (!investmentTypes) return "";
  return investmentTypes
    .split(",")
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => !isNaN(n))
    .map((id) => typeMap[id])
    .filter(Boolean)
    .join(", ");
}

function handleBase64Pdf(base64Data: string | null | undefined): string {
  if (!base64Data) return "";

  let rawBase64 = base64Data;
  if (base64Data.startsWith("data:")) {
    const match = base64Data.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) return "";
    rawBase64 = match[1];
  }

  const newFileName = crypto.randomUUID() + ".pdf";

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const filePath = path.join(UPLOADS_DIR, newFileName);
  fs.writeFileSync(filePath, Buffer.from(rawBase64, "base64"));

  return `/api/uploads/${newFileName}`;
}

router.get("/get-all-investment-name-list", async (req: Request, res: Response) => {
  try {
    const investmentStage = parseInt(String(req.query.investmentStage || "0"), 10);
    const investmentId = parseInt(String(req.query.investmentId || "0"), 10) || 0;

    if (investmentStage === 4) {
      const campaignResult = await pool.query(
        `SELECT id, name, investment_types
         FROM campaigns
         WHERE stage != $1 AND TRIM(COALESCE(name, '')) != ''
         ORDER BY name ASC`,
        [STAGE_CLOSED_NOT_INVESTED]
      );

      const investmentTypesResult = await pool.query(`SELECT id, name FROM investment_types`);
      const investmentTypes = investmentTypesResult.rows;

      const result = campaignResult.rows.map((c: any) => {
        let isPrivateDebt = false;
        if (c.investment_types) {
          const typeIds = c.investment_types
            .split(",")
            .map((s: string) => parseInt(s.trim(), 10))
            .filter((n: number) => !isNaN(n));
          isPrivateDebt = typeIds.some((typeId: number) => {
            const it = investmentTypes.find((t: any) => t.id === typeId);
            return it && it.name && it.name.includes("Private Debt");
          });
        }
        return { id: c.id, name: c.name, isPrivateDebt };
      });

      res.json(result);
    } else if (investmentStage === 3) {
      const result = await pool.query(
        `SELECT id, name
         FROM campaigns
         WHERE stage = $1 AND TRIM(COALESCE(name, '')) != ''
         ORDER BY name ASC`,
        [STAGE_CLOSED_INVESTED]
      );

      res.json(result.rows.map((c: any) => ({ id: c.id, name: c.name })));
    } else if (investmentStage === 0) {
      let query = `SELECT id, name FROM campaigns WHERE TRIM(COALESCE(name, '')) != ''`;
      const values: any[] = [];

      if (investmentId > 0) {
        query += ` AND id != $1`;
        values.push(investmentId);
      }

      query += ` ORDER BY name ASC`;

      const result = await pool.query(query, values);
      res.json(result.rows.map((c: any) => ({ id: c.id, name: c.name })));
    } else {
      res.status(400).json({ success: false, message: "Invalid investment stage." });
    }
  } catch (err: any) {
    console.error("Error fetching investment name list:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/user-disbursal-investments", jwtUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ success: false, message: "User email not found." });
      return;
    }

    const result = await pool.query(
      `SELECT id, name, property, investment_role, impact_assets_funding_status,
              contact_info_phone_number, investment_types
       FROM campaigns
       WHERE is_active = true
         AND COALESCE(TRIM(contact_info_email_address), '') = $1
       ORDER BY name ASC`,
      [email]
    );

    const campaigns = result.rows;

    if (campaigns.length === 0) {
      res.json([]);
      return;
    }

    const typeMap = await buildInvestmentTypeMap(campaigns);

    const mapped = campaigns.map((c: any) => ({
      id: c.id,
      name: c.name,
      property: c.property,
      investmentRole: c.investment_role,
      impactAssetsFundingStatus: c.impact_assets_funding_status,
      contactInfoPhoneNumber: c.contact_info_phone_number,
      investmentType: resolveInvestmentTypeString(c.investment_types, typeMap),
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error("Error fetching user disbursal investments:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/save-disbursal", jwtUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const loginUserId = req.user?.id;
    if (!loginUserId) {
      res.status(400).json({ success: false, message: "User not found." });
      return;
    }

    const dto = req.body;

    if (dto.id && dto.id > 0) {
      const existing = await pool.query(
        `SELECT id FROM disbursal_requests WHERE id = $1 AND user_id = $2 AND (is_deleted IS NULL OR is_deleted = false)`,
        [dto.id, loginUserId]
      );

      if (existing.rows.length === 0) {
        res.json({ success: false, message: "Data not found." });
        return;
      }

      if (dto.note && dto.note.trim()) {
        await pool.query(
          `INSERT INTO disbursal_request_notes (disbursal_request_id, note, created_by, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [dto.id, dto.note.trim(), loginUserId]
        );
      }

      res.json({ success: true, message: "Disbursal request updated successfully." });
      return;
    }

    let pitchDeckFile = "";
    let investmentDocFile = "";

    if (dto.pitchDeck) {
      pitchDeckFile = handleBase64Pdf(dto.pitchDeck);
    }

    if (dto.investmentDocument) {
      investmentDocFile = handleBase64Pdf(dto.investmentDocument);
    }

    const insertResult = await pool.query(
      `INSERT INTO disbursal_requests
        (user_id, campaign_id, role, mobile, quote, distributed_amount, status,
         impact_assets_funding_previously, investment_remain_open, receive_date,
         pitch_deck, pitch_deck_name, investment_document, investment_document_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING id`,
      [
        loginUserId,
        dto.campaignId || null,
        dto.role || null,
        dto.mobile || null,
        dto.quote || null,
        dto.distributedAmount || 0,
        dto.impactAssetsFundingPreviously || null,
        dto.investmentRemainOpen || null,
        dto.receiveDate || null,
        pitchDeckFile || null,
        dto.pitchDeckName || null,
        investmentDocFile || null,
        dto.investmentDocumentName || null,
      ]
    );

    const disbursalId = insertResult.rows[0].id;

    const campaignResult = await pool.query(
      `SELECT name FROM campaigns WHERE id = $1`,
      [dto.campaignId]
    );
    const investmentName = campaignResult.rows[0]?.name || "";

    const formattedAmountStr = formatAmount(dto.distributedAmount);
    const formattedDate = formatDateSlash(dto.receiveDate);

    const requestOrigin = process.env.REQUEST_ORIGIN || process.env.VITE_FRONTEND_URL || "";
    const disbursementUrl = `${requestOrigin}/disbursal-request-detail/${disbursalId}`;
    const adminEmail = process.env.CATACAP_ADMIN_EMAIL || "";
    const logoUrl = process.env.LOGO_URL || "";

    try {
      await sendTemplateEmail(22, adminEmail, {
        logoUrl,
        investmentName,
        amount: formattedAmountStr,
        date: formattedDate,
        disbursementUrl,
      });
    } catch (emailErr: any) {
      console.error("Error sending disbursal email notification:", emailErr);
    }

    res.json({ success: true, message: "Disbursal request saved successfully." });
  } catch (err: any) {
    console.error("Error saving disbursal request:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/get-disbursal-request", jwtUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.query.id || "0"), 10);
    if (!id || id <= 0) {
      res.json({ success: false, message: "Id is required." });
      return;
    }

    const loginUserId = req.user?.id;

    const result = await pool.query(
      `SELECT d.id, u.first_name, u.last_name, u.email, d.role, d.mobile,
              d.status, d.quote, c.name, d.distributed_amount, c.property,
              d.investment_remain_open, d.receive_date, d.pitch_deck,
              d.pitch_deck_name, d.investment_document, d.investment_document_name,
              d.impact_assets_funding_previously, c.investment_types
       FROM disbursal_requests d
       JOIN campaigns c ON d.campaign_id = c.id
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = $1 AND d.user_id = $2 AND (d.is_deleted IS NULL OR d.is_deleted = false)`,
      [id, loginUserId]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Disbursal Request not found." });
      return;
    }

    const row = result.rows[0];
    const typeMap = await buildInvestmentTypeMap([row]);
    const investmentTypeNames = resolveInvestmentTypeString(row.investment_types, typeMap);

    res.json({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      role: row.role,
      mobile: row.mobile,
      name: row.name,
      distributedAmount: parseFloat(row.distributed_amount) || 0,
      property: row.property,
      investmentRemainOpen: row.investment_remain_open,
      receiveDate: formatDate(row.receive_date),
      pitchDeck: row.pitch_deck,
      status: row.status,
      statusName: getStatusName(row.status),
      quote: row.quote,
      pitchDeckName: row.pitch_deck_name,
      investmentDocument: row.investment_document,
      investmentDocumentName: row.investment_document_name,
      impactAssetsFundingPreviously: row.impact_assets_funding_previously,
      investmentTypeNames,
    });
  } catch (err: any) {
    console.error("Error fetching disbursal request:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/get-disbursal-request-list", jwtUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = (params.sortDirection || "").toLowerCase() === "asc";
    const page = params.currentPage;
    const pageSize = params.perPage;
    const loginUserId = req.user?.id;

    const queryText = `
      SELECT d.id, d.receive_date, u.email, d.mobile, d.distributed_amount,
             d.status, d.quote, c.name, c.id AS investment_id, c.property,
             d.pitch_deck, d.pitch_deck_name, d.investment_document,
             d.investment_document_name, c.investment_types
      FROM disbursal_requests d
      JOIN campaigns c ON d.campaign_id = c.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.user_id = $1 AND (d.is_deleted IS NULL OR d.is_deleted = false)
    `;

    const allResult = await pool.query(queryText, [loginUserId]);
    let rows = allResult.rows;

    const totalCount = rows.length;

    if (params.searchValue) {
      const sv = params.searchValue.trim().toLowerCase();
      rows = rows.filter(
        (r: any) =>
          (r.name || "").trim().toLowerCase().includes(sv) ||
          (r.email || "").toLowerCase().includes(sv)
      );
    }

    const sortCol = (params.sortField || "").toLowerCase();
    rows.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortCol) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "email":
          cmp = (a.email || "").localeCompare(b.email || "");
          break;
        case "amount":
          cmp = (parseFloat(a.distributed_amount) || 0) - (parseFloat(b.distributed_amount) || 0);
          break;
        case "date":
          cmp = new Date(a.receive_date || 0).getTime() - new Date(b.receive_date || 0).getTime();
          break;
        default:
          cmp = (a.id || 0) - (b.id || 0);
          return isAsc ? cmp : -cmp;
      }
      return isAsc ? cmp : -cmp;
    });

    const typeMap = await buildInvestmentTypeMap(rows);

    const noteCheckIds = rows.map((r: any) => r.id);
    let notesSet = new Set<number>();
    if (noteCheckIds.length > 0) {
      const notePlaceholders = noteCheckIds.map((_: any, i: number) => `$${i + 1}`).join(", ");
      const notesResult = await pool.query(
        `SELECT DISTINCT disbursal_request_id FROM disbursal_request_notes WHERE disbursal_request_id IN (${notePlaceholders})`,
        noteCheckIds
      );
      notesSet = new Set(notesResult.rows.map((r: any) => r.disbursal_request_id));
    }

    const mapped = rows.map((x: any) => ({
      id: x.id,
      name: x.name,
      investmentId: x.investment_id,
      property: x.property,
      email: x.email,
      mobile: x.mobile,
      quote: x.quote,
      status: x.status,
      statusName: getStatusName(x.status),
      receiveDate: formatDate(x.receive_date),
      distributedAmount: parseFloat(x.distributed_amount) || 0,
      investmentType: resolveInvestmentTypeString(x.investment_types, typeMap),
      pitchDeck: x.pitch_deck,
      pitchDeckName: x.pitch_deck_name,
      investmentDocument: x.investment_document,
      investmentDocumentName: x.investment_document_name,
      hasNotes: notesSet.has(x.id),
    }));

    const items = mapped.slice((page - 1) * pageSize, page * pageSize);

    if (items.length > 0) {
      res.json({ items, totalCount });
    } else {
      res.json({ success: false, message: "Data not found." });
    }
  } catch (err: any) {
    console.error("Error fetching disbursal request list:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export-disbursal-request-list", jwtUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const loginUserId = req.user?.id;
    const queryText = `
      SELECT d.id, d.receive_date, u.email, d.distributed_amount,
             c.name, d.quote, d.status, c.investment_types
      FROM disbursal_requests d
      JOIN campaigns c ON d.campaign_id = c.id
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.user_id = $1 AND (d.is_deleted IS NULL OR d.is_deleted = false)
    `;
    const result = await pool.query(queryText, [loginUserId]);
    const data = result.rows;

    const typeMap = await buildInvestmentTypeMap(data);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("DisbursalRequest");

    const headers = ["Investment", "Email", "Disbursement Date", "Amount", "Investment Type", "Status", "Quote"];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const row of data) {
      const amountCell = formatAmount(row.distributed_amount);
      worksheet.addRow([
        row.name || "",
        row.email || "",
        row.receive_date ? row.receive_date : "",
        amountCell,
        resolveInvestmentTypeString(row.investment_types, typeMap),
        getStatusName(row.status),
        row.quote || "",
      ]);
    }

    worksheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value || "").length;
        if (len > maxLen) maxLen = len;
      });
      col.width = maxLen + 10;
    });

    const amountColIndex = 4;
    worksheet.getColumn(amountColIndex).alignment = { horizontal: "right" };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=DisbursalRequest.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("Error exporting disbursal request list:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/get-disbursal-request-notes", jwtUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const disbursalRequestId = parseInt(String(req.query.disbursalRequestId || "0"), 10);
    if (!disbursalRequestId || disbursalRequestId <= 0) {
      res.json({ success: false, message: "Invalid disbursal request id" });
      return;
    }

    const loginUserId = req.user?.id;

    const ownerCheck = await pool.query(
      `SELECT id FROM disbursal_requests WHERE id = $1 AND user_id = $2 AND (is_deleted IS NULL OR is_deleted = false)`,
      [disbursalRequestId, loginUserId]
    );

    if (ownerCheck.rows.length === 0) {
      res.json({ success: false, message: "Notes not found" });
      return;
    }

    const result = await pool.query(
      `SELECT n.id, n.note, u.user_name AS "userName", n.created_at AS "createdAt"
       FROM disbursal_request_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.disbursal_request_id = $1
       ORDER BY n.id DESC`,
      [disbursalRequestId]
    );

    if (result.rows.length > 0) {
      res.json(result.rows);
    } else {
      res.json({ success: false, message: "Notes not found" });
    }
  } catch (err: any) {
    console.error("Error fetching disbursal request notes:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
