import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter } from "../utils/softDelete.js";

const router = Router();

const EmailTemplateStatus: Record<number, string> = {
  1: "Draft",
  2: "Active",
  3: "Inactive",
};

const EmailTemplateCategoryMap: Record<number, { name: string; label: string }> = {
  1: { name: "WelcomeAnonymousUser", label: "Welcome Anonymous User" },
  2: { name: "WelcomeRegisteredUser", label: "Welcome Registered User" },
  3: { name: "PasswordReset", label: "Password Reset" },
  4: { name: "DAFDonationInstructions", label: "DAF Donation Instructions" },
  5: { name: "FoundationDonationInstructions", label: "Foundation Donation Instructions" },
  6: { name: "DonationReceipt", label: "Donation Receipt" },
  7: { name: "ACHPaymentRequest", label: "ACH Payment Request" },
  8: { name: "DonationConfirmation", label: "Donation Confirmation" },
  9: { name: "GrantReceived", label: "Grant Received" },
  10: { name: "DAFReminderDay3", label: "DAF Reminder (Day 3)" },
  11: { name: "FoundationReminderWeek2", label: "Foundation Reminder (Week 2)" },
  12: { name: "GroupInvestmentNotification", label: "Group Investment Notification" },
  13: { name: "InvestmentActivityNotification", label: "Investment Activity Notification" },
  14: { name: "FollowerInfluenceNotification", label: "Follower Influence Notification" },
  15: { name: "CampaignOwnerFundingNotification", label: "Campaign Owner Funding Notification" },
  16: { name: "InvestmentUnderReview", label: "Investment Under Review" },
  17: { name: "InvestmentQRCode", label: "Investment QR Code" },
  18: { name: "InvestmentNoteMention", label: "Investment Note Mention" },
  19: { name: "InvestmentApproved", label: "Investment Approved" },
  20: { name: "ComplianceReviewNotification", label: "Compliance Review Notification" },
  21: { name: "InvestmentPublished", label: "Investment Published" },
  22: { name: "DisbursementRequest", label: "Disbursement Request" },
  23: { name: "InvestmentSubmissionNotification", label: "Investment Submission Notification" },
  24: { name: "PendingGrantNotification", label: "Pending Grant Notification" },
  25: { name: "ACHFailureNotification", label: "ACH Failure Notification" },
  26: { name: "ACHPaymentRequestAdmin", label: "ACH Payment Request (Admin)" },
  27: { name: "AssetDonationRequest", label: "Asset Donation Request" },
  28: { name: "GroupJoinRequestNotification", label: "Group Join Request Notification" },
  29: { name: "DAFDonationInstructionsImpactAssets", label: "DAF Donation Instructions ImpactAssets" },
  30: { name: "CampaignInvestmentNotification", label: "Campaign Investment Notification" },
  31: { name: "DAFReminderImpactAssetsDay3", label: "DAF Reminder ImpactAssets (Day 3)" },
  32: { name: "DAFReminderImpactAssetsWeek2", label: "DAF Reminder ImpactAssets (Week 2)" },
  33: { name: "DAFReminderWeek2", label: "DAF Reminder (Week 2)" },
  34: { name: "FoundationReminderDay3", label: "Foundation Reminder (Day 3)" },
  35: { name: "TwoFactorAuthentication", label: "Login Verification Code" },
};

function getCategoryName(category: number): string {
  return EmailTemplateCategoryMap[category]?.name || `Category${category}`;
}

function getCategoryLabel(category: number): string {
  return EmailTemplateCategoryMap[category]?.label || `Category ${category}`;
}

function getStatusName(status: number): string {
  return EmailTemplateStatus[status] || "Unknown";
}

function extractVariables(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.matchAll(/\{\{(.*?)\}\}/g);
  const vars = new Set<string>();
  for (const match of matches) {
    vars.add(match[1].trim());
  }
  return Array.from(vars);
}

router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const categories = Object.entries(EmailTemplateCategoryMap)
      .map(([id, val]) => ({
        id: parseInt(id),
        name: val.name,
        label: val.label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    res.json(categories);
  } catch (err) {
    console.error("EmailTemplate GetCategories error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/preview/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT name, subject, body_html FROM email_templates WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Template not found." });
      return;
    }

    const r = result.rows[0];
    res.json({ name: r.name, subject: r.subject, bodyHtml: r.body_html });
  } catch (err) {
    console.error("EmailTemplate Preview error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/html/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT body_html FROM email_templates WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Template not found." });
      return;
    }

    res.json(result.rows[0].body_html);
  } catch (err) {
    console.error("EmailTemplate GetHtml error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/duplicate/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT name, subject, body_html, category, receiver, trigger_action FROM email_templates WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Template not found." });
      return;
    }

    const r = result.rows[0];
    res.json({
      name: r.name + " (Copy)",
      subject: r.subject,
      bodyHtml: r.body_html,
      category: r.category,
      categoryName: getCategoryName(r.category),
      status: 1,
      statusName: "Draft",
      receiver: r.receiver || null,
      triggerAction: r.trigger_action || null,
    });
  } catch (err) {
    console.error("EmailTemplate Duplicate error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT id, name, subject, body_html, category, status, receiver, trigger_action
       FROM email_templates WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Template not found." });
      return;
    }

    const r = result.rows[0];
    res.json({
      id: r.id,
      name: r.name,
      subject: r.subject,
      bodyHtml: r.body_html,
      category: r.category,
      categoryName: getCategoryName(r.category),
      status: r.status,
      statusName: getStatusName(r.status),
      receiver: r.receiver,
      triggerAction: r.trigger_action,
    });
  } catch (err) {
    console.error("EmailTemplate GetById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("et", params.isDeleted, conditions);

    if (params.searchValue) {
      conditions.push(`(LOWER(et.name) LIKE $${paramIdx} OR LOWER(et.subject) LIKE $${paramIdx})`);
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    if (params.category !== undefined) {
      conditions.push(`et.category = $${paramIdx}`);
      values.push(params.category);
      paramIdx++;
    }

    if (params.status) {
      const statusLower = params.status.toLowerCase();
      if (statusLower === "draft" || statusLower === "1") {
        conditions.push(`et.status = 1`);
      } else if (statusLower === "active" || statusLower === "2") {
        conditions.push(`et.status = 2`);
      } else if (statusLower === "inactive" || statusLower === "3") {
        conditions.push(`et.status = 3`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortMap: Record<string, string> = {
      name: "et.name",
      subject: "et.subject",
      category: "et.category",
      status: "et.status",
      modifiedat: "modified_at_resolved",
    };
    const sortField = (params.sortField || "").toLowerCase();
    const sortCol = sortMap[sortField] || "modified_at_resolved";
    const orderDir = isAsc ? "ASC" : "DESC";

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM email_templates et ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT et.id, et.name, et.subject, et.category, et.status,
              et.receiver, et.trigger_action,
              COALESCE(et.modified_at, et.created_at) AS modified_at_resolved,
              et.deleted_at,
              du.first_name || ' ' || du.last_name AS deleted_by_name
       FROM email_templates et
       LEFT JOIN users du ON et.deleted_by = du.id
       ${whereClause}
       ORDER BY ${sortCol} ${orderDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    let items = dataResult.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      bodyHtml: null as string | null,
      category: r.category,
      categoryName: getCategoryLabel(r.category),
      status: r.status,
      statusName: getStatusName(r.status),
      receiver: r.receiver,
      triggerAction: r.trigger_action,
      modifiedAt: r.modified_at_resolved,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by_name || null,
    }));

    if (sortField === "category") {
      items.sort((a: any, b: any) => {
        const cmp = a.categoryName.localeCompare(b.categoryName);
        return isAsc ? cmp : -cmp;
      });
    } else if (sortField === "status") {
      items.sort((a: any, b: any) => {
        const cmp = a.statusName.localeCompare(b.statusName);
        return isAsc ? cmp : -cmp;
      });
    }

    res.json({ totalRecords: parseInt(countResult.rows[0].total) || 0, items });
  } catch (err) {
    console.error("EmailTemplate GetAll error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const dto = req.body;
    if (!dto) { res.status(400).json({ message: "Invalid data." }); return; }

    const userId = req.user?.id || null;

    if (dto.status === 2) {
      const activeCheck = await pool.query(
        `SELECT id FROM email_templates WHERE category = $1 AND status = 2 AND id != $2 AND (is_deleted IS NULL OR is_deleted = false)`,
        [dto.category, dto.id || 0]
      );

      if (activeCheck.rows.length > 0) {
        res.json({ success: false, message: "An active template already exists for this category." });
        return;
      }
    }

    let templateId: number;

    if (dto.id && dto.id > 0) {
      const existing = await pool.query(`SELECT id FROM email_templates WHERE id = $1`, [dto.id]);
      if (existing.rows.length === 0) {
        res.json({ success: false, message: "Template not found." });
        return;
      }

      await pool.query(
        `UPDATE email_templates
         SET name = $1, subject = $2, body_html = $3, category = $4, status = $5,
             receiver = $6, trigger_action = $7, modified_at = NOW(), modified_by = $8
         WHERE id = $9`,
        [dto.name, dto.subject, dto.bodyHtml, dto.category, dto.status,
         dto.receiver, dto.triggerAction, userId, dto.id]
      );

      templateId = dto.id;

      await syncTemplateVariables(templateId, dto.category, dto.subject, dto.bodyHtml);

      res.json({ success: true, message: "Template updated successfully.", data: templateId });
    } else {
      const result = await pool.query(
        `INSERT INTO email_templates (name, subject, body_html, category, status, receiver, trigger_action, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
         RETURNING id`,
        [dto.name, dto.subject, dto.bodyHtml, dto.category, dto.status,
         dto.receiver, dto.triggerAction, userId]
      );

      templateId = result.rows[0].id;

      await syncTemplateVariables(templateId, dto.category, dto.subject, dto.bodyHtml);

      res.json({ success: true, message: "Template created successfully.", data: templateId });
    }
  } catch (err) {
    console.error("EmailTemplate Save error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

async function syncTemplateVariables(templateId: number, category: number, subject: string, bodyHtml: string) {
  await pool.query(`DELETE FROM email_template_variables WHERE category = $1`, [category]);

  const subjectVars = extractVariables(subject);
  const bodyVars = extractVariables(bodyHtml);
  const allVars = [...new Set([...subjectVars, ...bodyVars])];

  for (const varName of allVars) {
    await pool.query(
      `INSERT INTO email_template_variables (category, variable_name, email_template_id)
       VALUES ($1, $2, $3)`,
      [category, varName, templateId]
    );
  }
}

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const existing = await pool.query(`SELECT id FROM email_templates WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.json({ success: false, message: "Email template not found." });
      return;
    }

    await pool.query(`DELETE FROM email_template_variables WHERE email_template_id = $1`, [id]);
    await pool.query(`DELETE FROM email_templates WHERE id = $1`, [id]);

    res.json({ success: true, message: "Email template deleted successfully." });
  } catch (err) {
    console.error("EmailTemplate Delete error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/restore", async (req: Request, res: Response) => {
  try {
    const ids: number[] = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.json({ success: false, message: "No IDs provided." });
      return;
    }

    const result = await pool.query(
      `UPDATE email_templates SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id = ANY($1) AND is_deleted = true
       RETURNING id`,
      [ids]
    );

    if (result.rowCount === 0) {
      res.json({ success: false, message: "No deleted email templates found to restore." });
      return;
    }

    res.json({ success: true, message: `${result.rowCount} email template(s) restored successfully.` });
  } catch (err) {
    console.error("EmailTemplate Restore error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
