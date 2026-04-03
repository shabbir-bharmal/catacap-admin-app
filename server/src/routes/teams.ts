import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter } from "../utils/softDelete.js";
import { resolveFileUrl } from "../utils/uploadBase64Image.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("t", params.isDeleted, conditions);

    if (params.searchValue) {
      conditions.push(
        `(LOWER(t.first_name) LIKE $${paramIdx} OR LOWER(t.last_name) LIKE $${paramIdx} OR LOWER(t.first_name || ' ' || t.last_name) LIKE $${paramIdx} OR LOWER(t.designation) LIKE $${paramIdx})`
      );
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    if (params.isManagement !== undefined) {
      conditions.push(`t.is_management = $${paramIdx}`);
      values.push(params.isManagement);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortMap: Record<string, string> = {
      name: "t.first_name",
      designation: "t.designation",
    };
    const sortField = (params.sortField || "").toLowerCase();
    let orderClause: string;
    if (sortField === "name") {
      orderClause = isAsc
        ? "t.first_name ASC, t.last_name ASC, t.display_order ASC"
        : "t.first_name DESC, t.last_name DESC, t.display_order DESC";
    } else if (sortField === "designation") {
      orderClause = isAsc
        ? "t.designation ASC, t.display_order ASC"
        : "t.designation DESC, t.display_order DESC";
    } else {
      orderClause = isAsc
        ? "t.is_management ASC, t.display_order ASC"
        : "t.is_management DESC, t.display_order DESC";
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM catacap_teams t ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT
         t.id, t.first_name, t.last_name, t.designation, t.description,
         t.image_file_name, t.linkedin_url, t.is_management, t.display_order,
         t.deleted_at,
         du.first_name || ' ' || du.last_name AS deleted_by_name
       FROM catacap_teams t
       LEFT JOIN users du ON t.deleted_by = du.id
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((r: any) => ({
      id: r.id,
      fullName: `${r.first_name} ${r.last_name}`,
      firstName: r.first_name,
      lastName: r.last_name,
      designation: r.designation,
      description: r.description,
      imageFileName: resolveFileUrl(r.image_file_name),
      linkedInUrl: r.linkedin_url,
      isManagement: r.is_management ?? false,
      displayOrder: r.display_order,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by_name,
    }));

    res.json({ totalCount: parseInt(countResult.rows[0].total) || 0, items });
  } catch (err) {
    console.error("Teams GetAll error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT id, first_name, last_name, designation, description,
              image_file_name, linkedin_url, is_management, display_order
       FROM catacap_teams WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Team member not found." });
      return;
    }

    const r = result.rows[0];
    res.json({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      designation: r.designation,
      description: r.description,
      imageFileName: resolveFileUrl(r.image_file_name),
      linkedInUrl: r.linkedin_url,
      isManagement: r.is_management ?? false,
      displayOrder: r.display_order,
    });
  } catch (err) {
    console.error("Teams GetById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const dto = req.body;
    if (!dto) { res.status(400).json({ message: "Invalid data." }); return; }

    const userId = req.user?.id || null;

    if (dto.id && dto.id > 0) {
      const existing = await pool.query(`SELECT id FROM catacap_teams WHERE id = $1`, [dto.id]);
      if (existing.rows.length === 0) {
        res.status(404).json({ message: "Team member not found." });
        return;
      }

      const imageFileName = dto.imageFileName || null;

      await pool.query(
        `UPDATE catacap_teams SET
           first_name = $1, last_name = $2, designation = $3, description = $4,
           image_file_name = COALESCE($5, image_file_name),
           linkedin_url = $6, is_management = $7,
           modified_at = NOW(), modified_by = $8
         WHERE id = $9`,
        [
          dto.firstName, dto.lastName, dto.designation, dto.description,
          imageFileName,
          dto.linkedInUrl, dto.isManagement,
          userId, dto.id,
        ]
      );

      res.json({ success: true, message: "Team member updated successfully.", data: dto.id });
    } else {
      const lastOrderResult = await pool.query(
        `SELECT COALESCE(MAX(display_order), 0) AS max_order FROM catacap_teams WHERE is_management = $1`,
        [dto.isManagement ?? false]
      );
      const nextOrder = (parseInt(lastOrderResult.rows[0].max_order) || 0) + 1;

      const result = await pool.query(
        `INSERT INTO catacap_teams (first_name, last_name, designation, description,
           image_file_name, linkedin_url, is_management, display_order,
           created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         RETURNING id`,
        [
          dto.firstName, dto.lastName, dto.designation, dto.description,
          dto.imageFileName || dto.image || null,
          dto.linkedInUrl, dto.isManagement ?? false, nextOrder, userId,
        ]
      );

      res.json({ success: true, message: "Team member created successfully.", data: result.rows[0].id });
    }
  } catch (err) {
    console.error("Teams CreateOrUpdate error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const userId = req.user?.id || null;
    const existing = await pool.query(`SELECT id FROM catacap_teams WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.json({ success: false, message: "Team member not found." });
      return;
    }

    await pool.query(
      `UPDATE catacap_teams SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [userId, id]
    );

    res.json({ success: true, message: "Team member deleted successfully." });
  } catch (err) {
    console.error("Teams Delete error:", err);
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
      `UPDATE catacap_teams SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id = ANY($1) AND is_deleted = true
       RETURNING id`,
      [ids]
    );

    if (result.rowCount === 0) {
      res.json({ success: false, message: "No deleted team members found." });
      return;
    }

    res.json({ success: true, message: `${result.rowCount} team member(s) restored successfully.` });
  } catch (err) {
    console.error("Teams Restore error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/reorder", async (req: Request, res: Response) => {
  try {
    const items: Array<{ id: number; displayOrder: number }> = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ message: "Invalid data." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of items) {
        await client.query(
          `UPDATE catacap_teams SET display_order = $1 WHERE id = $2`,
          [item.displayOrder, item.id]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    const updatedResult = await pool.query(
      `SELECT id, first_name, last_name, designation, description,
              image_file_name, linkedin_url, is_management, display_order
       FROM catacap_teams
       WHERE (is_deleted IS NULL OR is_deleted = false)
       ORDER BY is_management, display_order`
    );

    const data = updatedResult.rows.map((r: any) => ({
      id: r.id,
      fullName: `${r.first_name} ${r.last_name}`,
      firstName: r.first_name,
      lastName: r.last_name,
      designation: r.designation,
      description: r.description,
      imageFileName: r.image_file_name,
      linkedInUrl: r.linkedin_url,
      isManagement: r.is_management ?? false,
      displayOrder: r.display_order,
    }));

    res.json({ success: true, message: "Team reordered successfully.", data });
  } catch (err) {
    console.error("Teams Reorder error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
