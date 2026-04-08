import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, buildSortClause, handleMissingTableError } from "../utils/softDelete.js";
import { resolveFileUrl, uploadBase64Image, extractStoragePath, ensureFolderPrefix } from "../utils/uploadBase64Image.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("e", params.isDeleted, conditions);

    if (params.searchValue) {
      conditions.push(`LOWER(e.title) LIKE $${paramIdx}`);
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortCol = buildSortClause(params.sortField, isAsc, {
      title: "e.title",
      eventdate: "e.event_date",
      status: "e.status",
    }, "e.created_at");

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM events e ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT
         e.id, e.title, e.description, e.event_date, e.event_time,
         e.registration_link, e.status, e.image_file_name, e.image,
         e.type, e.duration, e.deleted_at,
         du.first_name || ' ' || du.last_name AS deleted_by_name
       FROM events e
       LEFT JOIN users du ON e.deleted_by = du.id
       ${whereClause}
       ORDER BY ${sortCol}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      eventDate: r.event_date,
      eventTime: r.event_time,
      registrationLink: r.registration_link,
      status: r.status ?? false,
      imageFileName: resolveFileUrl(r.image_file_name, "events"),
      image: resolveFileUrl(r.image, "events") || resolveFileUrl(r.image_file_name, "events"),
      type: r.type,
      duration: r.duration,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by_name,
    }));

    res.json({ totalRecords: parseInt(countResult.rows[0].total) || 0, items });
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("Events GetAll error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT id, title, description, event_date, event_time,
              registration_link, status, image, image_file_name, type, duration
       FROM events WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "Event not found." });
      return;
    }

    const r = result.rows[0];
    res.json({
      id: r.id,
      title: r.title,
      description: r.description,
      eventDate: r.event_date,
      eventTime: r.event_time,
      registrationLink: r.registration_link,
      status: r.status ?? false,
      image: resolveFileUrl(r.image, "events") || resolveFileUrl(r.image_file_name, "events"),
      imageFileName: resolveFileUrl(r.image_file_name, "events"),
      type: r.type,
      duration: r.duration,
    });
  } catch (err) {
    console.error("Events GetById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const dto = req.body;
    if (!dto) { res.status(400).json({ message: "Invalid data." }); return; }

    const userId = req.user?.id || null;

    let imageFileName: string | null = null;
    let image: string | null = null;
    const base64Data = [dto.image, dto.imageFileName].find((v) => v && typeof v === "string" && v.startsWith("data:"));
    if (base64Data) {
      const uploadResult = await uploadBase64Image(base64Data, "events");
      imageFileName = uploadResult.filePath;
      image = uploadResult.filePath;
    } else {
      const existingPath = dto.imageFileName || dto.image || null;
      if (existingPath) {
        const resolved = ensureFolderPrefix(extractStoragePath(existingPath) || existingPath, "events");
        imageFileName = resolved;
        image = resolved;
      }
    }

    if (dto.id && dto.id > 0) {
      const existing = await pool.query(`SELECT id, image, image_file_name FROM events WHERE id = $1`, [dto.id]);
      if (existing.rows.length === 0) {
        res.json({ success: false, message: "Event not found." });
        return;
      }

      await pool.query(
        `UPDATE events SET
           title = $1, description = $2, event_date = $3, event_time = $4,
           registration_link = $5, status = $6,
           image_file_name = COALESCE(NULLIF($7, ''), image_file_name),
           image = COALESCE(NULLIF($8, ''), image),
           type = $9, duration = $10,
           modified_at = NOW(), modified_by = $11
         WHERE id = $12`,
        [
          dto.title, dto.description, dto.eventDate, dto.eventTime,
          dto.registrationLink, dto.status,
          imageFileName, image,
          dto.type, dto.duration,
          userId, dto.id,
        ]
      );

      res.json({ success: true, message: "Event updated successfully.", data: dto.id });
    } else {
      const result = await pool.query(
        `INSERT INTO events (title, description, event_date, event_time, registration_link, status,
           image_file_name, image, type, duration, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id`,
        [
          dto.title, dto.description, dto.eventDate, dto.eventTime,
          dto.registrationLink, dto.status,
          imageFileName, image,
          dto.type, dto.duration, userId,
        ]
      );

      res.json({ success: true, message: "Event created successfully.", data: result.rows[0].id });
    }
  } catch (err) {
    console.error("Events Save error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const userId = req.user?.id || null;

    const existing = await pool.query(`SELECT id FROM events WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.json({ success: false, message: "Event not found." });
      return;
    }

    await pool.query(
      `UPDATE events SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [userId, id]
    );

    res.json({ success: true, message: "Event deleted successfully." });
  } catch (err) {
    console.error("Events Delete error:", err);
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
      `UPDATE events SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id = ANY($1) AND is_deleted = true
       RETURNING id`,
      [ids]
    );

    if (result.rowCount === 0) {
      res.json({ success: false, message: "No deleted events found to restore." });
      return;
    }

    res.json({ success: true, message: `${result.rowCount} event(s) restored successfully.` });
  } catch (err) {
    console.error("Events Restore error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
