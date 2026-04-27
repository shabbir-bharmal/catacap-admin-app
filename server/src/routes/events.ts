import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, buildSortClause, handleMissingTableError } from "../utils/softDelete.js";
import { resolveFileUrl, uploadBase64Image, extractStoragePath, ensureFolderPrefix } from "../utils/uploadBase64Image.js";
import { modulePermission } from "../middleware/jwtAuth.js";

const router = Router();

const ALLOWED_LINK_TARGET_TYPES = new Set(["investments", "groups", "custom-pages"]);

type NormalizedLinkTarget = {
  type: string | null;
  ids: number[];
  slugs: string[];
};

function normalizeLinkTarget(dto: any): NormalizedLinkTarget {
  const rawType = typeof dto?.linkTargetType === "string" ? dto.linkTargetType.trim() : "";
  const type = ALLOWED_LINK_TARGET_TYPES.has(rawType) ? rawType : null;
  if (!type) return { type: null, ids: [], slugs: [] };

  const rawList = Array.isArray(dto?.linkTargetIds) ? dto.linkTargetIds : [];

  if (type === "custom-pages") {
    const slugs = Array.from(
      new Set(
        rawList
          .map((v: unknown) => (v == null ? "" : String(v).trim()))
          .filter((s: string) => s.length > 0)
      )
    ) as string[];
    return { type, ids: [], slugs };
  }

  const ids = Array.from(
    new Set(
      rawList
        .map((v: unknown) => parseInt(String(v), 10))
        .filter((n: number) => Number.isInteger(n) && n > 0)
    )
  ) as number[];
  return { type, ids, slugs: [] };
}

async function replaceEventLinks(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  eventId: number,
  target: NormalizedLinkTarget
): Promise<void> {
  await client.query(`DELETE FROM event_links WHERE event_id = $1`, [eventId]);
  if (!target.type) return;

  if (target.type === "custom-pages") {
    if (target.slugs.length === 0) return;
    const valuesSql = target.slugs.map((_, i) => `($1, $2, NULL, $${i + 3})`).join(", ");
    await client.query(
      `INSERT INTO event_links (event_id, target_type, target_id, target_slug)
       VALUES ${valuesSql}
       ON CONFLICT DO NOTHING`,
      [eventId, target.type, ...target.slugs]
    );
    return;
  }

  if (target.ids.length === 0) return;
  const valuesSql = target.ids.map((_, i) => `($1, $2, $${i + 3}, NULL)`).join(", ");
  await client.query(
    `INSERT INTO event_links (event_id, target_type, target_id, target_slug)
     VALUES ${valuesSql}
     ON CONFLICT DO NOTHING`,
    [eventId, target.type, ...target.ids]
  );
}

const LINK_TARGET_TYPE_SUBQUERY = `(
  SELECT target_type FROM event_links WHERE event_id = e.id LIMIT 1
)`;

const LINK_TARGET_IDS_SUBQUERY = `COALESCE(
  (
    SELECT array_agg(
             COALESCE(target_id::TEXT, target_slug)
             ORDER BY COALESCE(target_id::TEXT, target_slug)
           )
    FROM event_links
    WHERE event_id = e.id
  ),
  ARRAY[]::TEXT[]
)`;

function decodeLinkTargetIds(rawType: string | null, rawIds: unknown): Array<number | string> {
  if (!rawType || !Array.isArray(rawIds)) return [];
  if (rawType === "custom-pages") {
    return (rawIds as unknown[]).map((v) => String(v));
  }
  return (rawIds as unknown[])
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n));
}

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
         e.type, e.duration, e.page_url,
         ${LINK_TARGET_TYPE_SUBQUERY} AS link_target_type,
         ${LINK_TARGET_IDS_SUBQUERY} AS link_target_ids,
         e.deleted_at,
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
      pageUrl: r.page_url,
      linkTargetType: r.link_target_type,
      linkTargetIds: decodeLinkTargetIds(r.link_target_type, r.link_target_ids),
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

router.get("/registrations", modulePermission("event-registrations", "Manage"), async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = params.sortDirection?.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("er", params.isDeleted, conditions);

    if (params.searchValue) {
      conditions.push(
        `(LOWER(er.first_name) LIKE $${paramIdx} OR LOWER(er.last_name) LIKE $${paramIdx} OR LOWER(er.email) LIKE $${paramIdx} OR LOWER(er.event_slug) LIKE $${paramIdx})`
      );
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortCol = buildSortClause(
      params.sortField,
      isAsc,
      {
        eventslug: "er.event_slug",
        firstname: "er.first_name",
        lastname: "er.last_name",
        email: "er.email",
        createdat: "er.created_at",
      },
      "er.created_at"
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM event_registrations er ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT er.id, er.event_slug, er.first_name, er.last_name, er.email,
              er.guest_name, er.referred_by, er.created_at
       FROM event_registrations er
       ${whereClause}
       ORDER BY ${sortCol}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((r: any) => ({
      id: r.id,
      eventSlug: r.event_slug,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      guestName: r.guest_name,
      referredBy: r.referred_by,
      createdAt: r.created_at,
    }));

    res.json({ totalRecords: parseInt(countResult.rows[0].total) || 0, items });
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("Event Registrations GetAll error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/registrations/:id", modulePermission("event-registrations", "Delete"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid ID" });
      return;
    }

    const userId = req.user?.id || null;

    const existing = await pool.query(
      `SELECT id FROM event_registrations WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = false)`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.json({ success: false, message: "Event registration not found." });
      return;
    }

    await pool.query(
      `UPDATE event_registrations SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [userId, id]
    );

    res.json({ success: true, message: "Event registration deleted successfully." });
  } catch (err) {
    console.error("Event Registration Delete error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT e.id, e.title, e.description, e.event_date, e.event_time,
              e.registration_link, e.status, e.image, e.image_file_name, e.type, e.duration, e.page_url,
              ${LINK_TARGET_TYPE_SUBQUERY} AS link_target_type,
              ${LINK_TARGET_IDS_SUBQUERY} AS link_target_ids
       FROM events e
       WHERE e.id = $1`,
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
      pageUrl: r.page_url,
      linkTargetType: r.link_target_type,
      linkTargetIds: decodeLinkTargetIds(r.link_target_type, r.link_target_ids),
    });
  } catch (err) {
    console.error("Events GetById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();
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

    const linkTarget = normalizeLinkTarget(dto);

    await client.query("BEGIN");

    let savedId: number;

    if (dto.id && dto.id > 0) {
      const existing = await client.query(`SELECT id FROM events WHERE id = $1`, [dto.id]);
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        res.json({ success: false, message: "Event not found." });
        return;
      }

      await client.query(
        `UPDATE events SET
           title = $1, description = $2, event_date = $3, event_time = $4,
           registration_link = $5, status = $6,
           image_file_name = COALESCE(NULLIF($7, ''), image_file_name),
           image = COALESCE(NULLIF($8, ''), image),
           type = $9, duration = $10, page_url = $11,
           modified_at = NOW(), modified_by = $12
         WHERE id = $13`,
        [
          dto.title, dto.description, dto.eventDate, dto.eventTime,
          dto.registrationLink, dto.status,
          imageFileName, image,
          dto.type, dto.duration, dto.pageUrl ?? null,
          userId, dto.id,
        ]
      );

      savedId = dto.id;
      await replaceEventLinks(client, savedId, linkTarget);
      await client.query("COMMIT");
      res.json({ success: true, message: "Event updated successfully.", data: savedId });
    } else {
      const result = await client.query(
        `INSERT INTO events (title, description, event_date, event_time, registration_link, status,
           image_file_name, image, type, duration, page_url,
           created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         RETURNING id`,
        [
          dto.title, dto.description, dto.eventDate, dto.eventTime,
          dto.registrationLink, dto.status,
          imageFileName, image,
          dto.type, dto.duration, dto.pageUrl ?? null,
          userId,
        ]
      );

      savedId = result.rows[0].id as number;
      await replaceEventLinks(client, savedId, linkTarget);
      await client.query("COMMIT");
      res.json({ success: true, message: "Event created successfully.", data: savedId });
    }
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    console.error("Events Save error:", err);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
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
