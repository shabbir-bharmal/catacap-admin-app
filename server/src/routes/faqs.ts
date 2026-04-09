import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { parsePagination, softDeleteFilter, handleMissingTableError } from "../utils/softDelete.js";

const router = Router();

const FAQ_CATEGORY_NAMES: Record<number, string> = {
  1: "Donors/Investors",
  2: "Group Leaders",
  3: "Investments",
};

router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT category,
              COUNT(*) AS total_count,
              COUNT(CASE WHEN status = true THEN 1 END) AS active_count
       FROM faqs
       WHERE (is_deleted IS NULL OR is_deleted = false)
       GROUP BY category
       ORDER BY category`
    );

    const allCategories = [1, 2, 3];
    const dataMap = new Map<number, { activeCount: number; totalCount: number }>();
    for (const row of result.rows) {
      dataMap.set(row.category, {
        activeCount: parseInt(row.active_count) || 0,
        totalCount: parseInt(row.total_count) || 0,
      });
    }

    const response = allCategories.map((cat) => ({
      categoryName: FAQ_CATEGORY_NAMES[cat] || `Category ${cat}`,
      activeCount: dataMap.get(cat)?.activeCount || 0,
      totalCount: dataMap.get(cat)?.totalCount || 0,
    }));

    res.json(response);
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("FAQ Summary error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const params = parsePagination(req.query as Record<string, unknown>);
    const isAsc = !params.sortDirection || params.sortDirection.toLowerCase() === "asc";
    const offset = (params.currentPage - 1) * params.perPage;

    const conditions: string[] = [];
    const values: (string | number | boolean)[] = [];
    let paramIdx = 1;

    softDeleteFilter("f", params.isDeleted, conditions);

    if (params.searchValue) {
      conditions.push(`(LOWER(f.question) LIKE $${paramIdx} OR LOWER(f.answer) LIKE $${paramIdx})`);
      values.push(`%${params.searchValue.toLowerCase()}%`);
      paramIdx++;
    }

    if (params.category !== undefined) {
      conditions.push(`f.category = $${paramIdx}`);
      values.push(params.category);
      paramIdx++;
    }

    if (params.status) {
      const statusLower = params.status.toLowerCase();
      if (statusLower === "active" || statusLower === "true") {
        conditions.push(`f.status = true`);
      } else if (statusLower === "inactive" || statusLower === "draft" || statusLower === "false") {
        conditions.push(`f.status = false`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortMap: Record<string, string> = {
      question: "f.question",
      category: "f.category",
      status: "f.status",
    };
    const sortField = (params.sortField || "").toLowerCase();
    let orderClause: string;
    if (sortMap[sortField]) {
      orderClause = `${sortMap[sortField]} ${isAsc ? "ASC" : "DESC"}, f.display_order ${isAsc ? "ASC" : "DESC"}`;
    } else {
      orderClause = `f.category ASC, f.display_order ${isAsc ? "ASC" : "DESC"}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM faqs f ${whereClause}`,
      values
    );

    const dataResult = await pool.query(
      `SELECT f.id, f.category, f.question, f.answer, f.display_order, f.status,
              f.deleted_at,
              du.first_name || ' ' || du.last_name AS deleted_by_name
       FROM faqs f
       LEFT JOIN users du ON f.deleted_by = du.id
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, params.perPage, offset]
    );

    const items = dataResult.rows.map((r: any) => ({
      id: r.id,
      category: r.category,
      categoryName: FAQ_CATEGORY_NAMES[r.category] || `Category ${r.category}`,
      question: r.question,
      answer: r.answer,
      displayOrder: r.display_order,
      status: r.status ?? false,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by_name,
    }));

    res.json({ totalRecords: parseInt(countResult.rows[0].total) || 0, items });
  } catch (err: any) {
    if (handleMissingTableError(err, res)) return;
    console.error("FAQ GetAll error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const result = await pool.query(
      `SELECT id, category, question, answer, display_order, status
       FROM faqs WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.json({ success: false, message: "FAQ not found." });
      return;
    }

    const items = result.rows.map((r: any) => ({
      id: r.id,
      category: r.category,
      categoryName: FAQ_CATEGORY_NAMES[r.category] || `Category ${r.category}`,
      question: r.question,
      answer: r.answer,
      displayOrder: r.display_order,
      status: r.status ?? false,
    }));

    res.json(items);
  } catch (err) {
    console.error("FAQ GetById error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const dto = req.body;
    if (!dto) { res.status(400).json({ message: "Invalid data." }); return; }

    const userId = req.user?.id || null;

    if (dto.id && dto.id > 0) {
      const existing = await pool.query(`SELECT id FROM faqs WHERE id = $1`, [dto.id]);
      if (existing.rows.length === 0) {
        res.status(404).json({ message: "FAQ not found." });
        return;
      }

      await pool.query(
        `UPDATE faqs SET category = $1, question = $2, answer = $3, status = $4,
           modified_at = NOW(), modified_by = $5
         WHERE id = $6`,
        [dto.category, dto.question, dto.answer, dto.status, userId, dto.id]
      );

      res.json({ success: true, message: "FAQ updated successfully.", data: dto.id });
    } else {
      const lastOrderResult = await pool.query(
        `SELECT COALESCE(MAX(display_order), 0) AS max_order FROM faqs WHERE category = $1`,
        [dto.category]
      );
      const nextOrder = (parseInt(lastOrderResult.rows[0].max_order) || 0) + 1;

      const result = await pool.query(
        `INSERT INTO faqs (category, question, answer, status, display_order, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING id`,
        [dto.category, dto.question, dto.answer, dto.status, nextOrder, userId]
      );

      res.json({ success: true, message: "FAQ created successfully.", data: result.rows[0].id });
    }
  } catch (err) {
    console.error("FAQ Save error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }

    const userId = req.user?.id || null;
    const existing = await pool.query(`SELECT id FROM faqs WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.json({ success: false, message: "FAQ not found." });
      return;
    }

    await pool.query(
      `UPDATE faqs SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2`,
      [userId, id]
    );

    res.json({ success: true, message: "FAQ deleted successfully." });
  } catch (err) {
    console.error("FAQ Delete error:", err);
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
      `UPDATE faqs SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
       WHERE id = ANY($1) AND is_deleted = true
       RETURNING id`,
      [ids]
    );

    if (result.rowCount === 0) {
      res.json({ success: false, message: "No deleted FAQs found to restore." });
      return;
    }

    res.json({ success: true, message: `${result.rowCount} FAQ(s) restored successfully.` });
  } catch (err) {
    console.error("FAQ Restore error:", err);
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
          `UPDATE faqs SET display_order = $1 WHERE id = $2`,
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
      `SELECT id, category, question, answer, display_order, status
       FROM faqs
       WHERE (is_deleted IS NULL OR is_deleted = false)
       ORDER BY category, display_order`
    );

    const data = updatedResult.rows.map((r: any) => ({
      id: r.id,
      category: r.category,
      categoryName: FAQ_CATEGORY_NAMES[r.category] || `Category ${r.category}`,
      question: r.question,
      answer: r.answer,
      displayOrder: r.display_order,
      status: r.status ?? false,
    }));

    res.json({ success: true, message: "FAQ reordered successfully.", data });
  } catch (err) {
    console.error("FAQ Reorder error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
