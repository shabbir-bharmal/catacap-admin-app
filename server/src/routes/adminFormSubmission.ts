import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, buildSortClause, handleMissingTableError } from "../utils/softDelete.js";

const router = Router();

const FormType = {
  Companies: 1,
  Home: 2,
  ChampionDeal: 3,
  About: 4,
  Group: 5,
} as const;

const FormTypeDisplayNames: Record<number, string> = {
  1: "Companies",
  2: "Home",
  3: "Champion Deal",
  4: "About",
  5: "Group",
};

const FormSubmissionStatusDisplayNames: Record<number, string> = {
  1: "New",
  2: "Contacted",
  3: "In Progress",
  4: "Completed",
  5: "Archived",
};

const FormSubmissionStatusEnumNames: Record<number, string> = {
  1: "New",
  2: "Contacted",
  3: "InProgress",
  4: "Completed",
  5: "Archived",
};

interface FormSubmissionRow {
  id: number;
  form_type: number;
  status: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string;
  description: string | null;
  target_raise_amount: string | null;
  launch_partners: string | null;
  self_raise_amount_range: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_by_name: string | null;
}

interface FormSubmissionDetailRow {
  id: number;
  form_type: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  description: string | null;
  launch_partners: string | null;
  target_raise_amount: string | null;
  self_raise_amount_range: string | null;
  status: number;
  created_at: string;
}

interface FormSubmissionStatusRow {
  id: number;
  status: number;
}

interface ThemeRow {
  id: number;
  name: string;
}

interface SiteConfigRow {
  id: number;
  value: string;
}

interface NoteRow {
  id: number;
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  user_name: string | null;
  created_at: string;
}

interface FormSubmissionListItem {
  id: number;
  formType: number;
  formTypeName: string;
  status: number;
  statusName: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  createdAt: string;
  description: string | null;
  targetRaiseAmount: string | null;
  launchPartners: string | null;
  selfRaiseAmountRange: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

function extractIds(description: string): number[] {
  return description
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !isNaN(parseInt(x, 10)))
    .map((x) => parseInt(x, 10));
}

function buildFormSubmissionSort(sortField: string | undefined, isAsc: boolean): string {
  if (sortField?.toLowerCase() === "firstname") {
    const dir = isAsc ? "ASC" : "DESC";
    return `fs.first_name ${dir}, fs.last_name ${dir}`;
  }

  return buildSortClause(sortField, isAsc, {
    formtype: "fs.form_type",
    status: "fs.status",
    email: "fs.email",
    createdat: "fs.created_at",
  }, "fs.created_at DESC, fs.id");
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const formTypeRaw = req.query.formType || req.query.FormType;
    const formType = formTypeRaw ? parseInt(String(formTypeRaw), 10) : null;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("fs", params.isDeleted, conditions);

    if (formType && !isNaN(formType)) {
      conditions.push(`fs.form_type = $${paramIdx}`);
      values.push(formType);
      paramIdx++;
    }

    if (params.searchValue) {
      const search = params.searchValue.toLowerCase();
      conditions.push(
        `(LOWER(fs.first_name) LIKE $${paramIdx} OR LOWER(fs.last_name) LIKE $${paramIdx} OR LOWER(fs.first_name || ' ' || fs.last_name) LIKE $${paramIdx} OR LOWER(fs.email) LIKE $${paramIdx})`
      );
      values.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortCol = buildFormSubmissionSort(params.sortField, isAsc);

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM form_submissions fs ${whereClause}`,
      values
    );
    const totalCount = parseInt(countResult.rows[0].total) || 0;

    const dataResult = await pool.query<FormSubmissionRow>(
      `SELECT
         fs.id, fs.form_type, fs.status, fs.first_name, fs.last_name, fs.email,
         fs.created_at, fs.description, fs.target_raise_amount, fs.launch_partners,
         fs.self_raise_amount_range, fs.deleted_at, fs.deleted_by,
         du.first_name || ' ' || du.last_name AS deleted_by_name
       FROM form_submissions fs
       LEFT JOIN users du ON fs.deleted_by = du.id
       ${whereClause}
       ORDER BY ${sortCol}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const rows = dataResult.rows;

    const themeIds = rows
      .filter((r) => r.form_type === FormType.Home && r.description)
      .flatMap((r) => extractIds(r.description!));
    const uniqueThemeIds = [...new Set(themeIds)];

    const interestIds = rows
      .filter((r) => r.form_type === FormType.About && r.description)
      .flatMap((r) => extractIds(r.description!));
    const uniqueInterestIds = [...new Set(interestIds)];

    const themesMap: Record<number, string> = {};
    if (uniqueThemeIds.length > 0) {
      const themesResult = await pool.query<ThemeRow>(
        `SELECT id, name FROM themes WHERE id = ANY($1)`,
        [uniqueThemeIds]
      );
      for (const t of themesResult.rows) {
        themesMap[t.id] = t.name;
      }
    }

    const interestsMap: Record<number, string> = {};
    if (uniqueInterestIds.length > 0) {
      const interestsResult = await pool.query<SiteConfigRow>(
        `SELECT id, value FROM site_configurations WHERE id = ANY($1)`,
        [uniqueInterestIds]
      );
      for (const i of interestsResult.rows) {
        interestsMap[i.id] = i.value;
      }
    }

    let items: FormSubmissionListItem[] = rows.map((r) => {
      let description: string | null = r.description;

      if (r.description) {
        if (r.form_type === FormType.Home) {
          const ids = extractIds(r.description);
          description = ids
            .filter((id) => themesMap[id])
            .map((id) => themesMap[id])
            .join(", ");
        } else if (r.form_type === FormType.About) {
          const ids = extractIds(r.description);
          description = ids
            .filter((id) => interestsMap[id])
            .map((id) => interestsMap[id])
            .join(", ");
        }
      }

      return {
        id: r.id,
        formType: r.form_type,
        formTypeName: FormTypeDisplayNames[r.form_type] || String(r.form_type),
        status: r.status,
        statusName: FormSubmissionStatusDisplayNames[r.status] || String(r.status),
        firstName: r.first_name,
        lastName: r.last_name,
        fullName: (r.first_name || "") + " " + (r.last_name || ""),
        email: r.email,
        createdAt: r.created_at,
        description,
        targetRaiseAmount: r.target_raise_amount,
        launchPartners: r.launch_partners,
        selfRaiseAmountRange: r.self_raise_amount_range,
        deletedAt: r.deleted_at,
        deletedBy: r.deleted_by_name || null,
      };
    });

    const sortField = params.sortField?.toLowerCase();
    if (sortField === "formtype") {
      items = isAsc
        ? items.sort((a, b) => a.formTypeName.localeCompare(b.formTypeName))
        : items.sort((a, b) => b.formTypeName.localeCompare(a.formTypeName));
    } else if (sortField === "status") {
      items = isAsc
        ? items.sort((a, b) => a.statusName.localeCompare(b.statusName))
        : items.sort((a, b) => b.statusName.localeCompare(a.statusName));
    }

    res.json({ totalCount, items });
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("Admin FormSubmission GetAll error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query<FormSubmissionDetailRow>(
      `SELECT id, form_type, first_name, last_name, email, description,
              launch_partners, target_raise_amount, self_raise_amount_range,
              status, created_at
       FROM form_submissions WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Form not found." });
      return;
    }

    const r = result.rows[0];
    let description: string | Array<{ id: number; name: string }> | Array<{ id: number; value: string }> | null = r.description;

    if (r.description) {
      if (r.form_type === FormType.Home || r.form_type === FormType.Group) {
        const ids = extractIds(r.description);
        if (ids.length > 0) {
          const themesResult = await pool.query<ThemeRow>(
            `SELECT id, name FROM themes WHERE id = ANY($1)`,
            [ids]
          );
          description = themesResult.rows.map((t) => ({ id: t.id, name: t.name }));
        }
      } else if (r.form_type === FormType.About) {
        const ids = extractIds(r.description);
        if (ids.length > 0) {
          const interestsResult = await pool.query<SiteConfigRow>(
            `SELECT id, value FROM site_configurations WHERE id = ANY($1)`,
            [ids]
          );
          description = interestsResult.rows.map((i) => ({ id: i.id, value: i.value }));
        }
      }
    }

    res.json({
      id: r.id,
      formType: r.form_type,
      formTypeName: FormTypeDisplayNames[r.form_type] || String(r.form_type),
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      description,
      launchPartners: r.launch_partners,
      targetRaiseAmount: r.target_raise_amount,
      selfRaiseAmountRange: r.self_raise_amount_range,
      status: r.status,
      statusName: FormSubmissionStatusDisplayNames[r.status] || String(r.status),
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error("Admin FormSubmission GetById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

interface UpdateFormSubmissionBody {
  id: number;
  status: number;
  note?: string;
}

router.put("/", async (req: Request, res: Response) => {
  try {
    const dto: UpdateFormSubmissionBody = req.body;

    const existing = await pool.query<FormSubmissionStatusRow>(
      `SELECT id, status FROM form_submissions WHERE id = $1`,
      [dto.id]
    );

    if (existing.rows.length === 0) {
      res.json({ success: false, message: "Form not found." });
      return;
    }

    const record = existing.rows[0];
    let oldStatus: string | null = null;
    let newStatus: string | null = null;

    if (record.status !== dto.status) {
      oldStatus = FormSubmissionStatusEnumNames[record.status] || String(record.status);
      newStatus = FormSubmissionStatusEnumNames[dto.status] || String(dto.status);
    }

    if (dto.note && dto.note.trim()) {
      const userId = req.user?.id || null;

      await pool.query(
        `INSERT INTO form_submission_notes
          (form_submission_id, note, created_by, created_at, old_status, new_status)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [record.id, dto.note.trim(), userId, oldStatus, newStatus]
      );
    }

    await pool.query(
      `UPDATE form_submissions SET status = $1 WHERE id = $2`,
      [dto.status, dto.id]
    );

    res.json({ success: true, message: "Form updated successfully." });
  } catch (err) {
    console.error("Admin FormSubmission Update error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id/notes", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id) || id <= 0) {
      res.json({ success: false, message: "Invalid id" });
      return;
    }

    const result = await pool.query<NoteRow>(
      `SELECT n.id, n.old_status, n.new_status, n.note, u.user_name, n.created_at
       FROM form_submission_notes n
       LEFT JOIN users u ON n.created_by = u.id
       WHERE n.form_submission_id = $1
       ORDER BY n.id DESC`,
      [id]
    );

    if (result.rows.length > 0) {
      const notes = result.rows.map((r) => ({
        id: r.id,
        oldStatus: r.old_status || null,
        newStatus: r.new_status || null,
        note: r.note,
        userName: r.user_name,
        createdAt: r.created_at,
      }));
      res.json(notes);
    } else {
      res.json({ success: false, message: "Notes not found" });
    }
  } catch (err) {
    console.error("Admin FormSubmission GetNotes error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const userId = req.user?.id || null;

    const existing = await pool.query<{ id: number }>(`SELECT id FROM form_submissions WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.json({ success: false, message: "Form not found." });
      return;
    }

    await pool.query(
      `UPDATE form_submissions SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [userId, id]
    );

    res.json({ success: true, message: "Form deleted successfully." });
  } catch (err) {
    console.error("Admin FormSubmission Delete error:", err);
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

    const existCheck = await pool.query<{ id: number }>(
      `SELECT id FROM form_submissions WHERE id = ANY($1)`,
      [ids]
    );

    if (existCheck.rows.length === 0) {
      res.json({ success: false, message: "Form not found." });
      return;
    }

    const result = await pool.query(
      `UPDATE form_submissions SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id = ANY($1) AND is_deleted = true
       RETURNING id`,
      [ids]
    );

    if (result.rowCount === 0) {
      res.json({ success: false, message: "No deleted forms found to restore." });
      return;
    }

    res.json({ success: true, message: `${result.rowCount} form(s) restored successfully.` });
  } catch (err) {
    console.error("Admin FormSubmission Restore error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
