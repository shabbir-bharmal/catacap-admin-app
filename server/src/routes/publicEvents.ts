import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { resolveFileUrl } from "../utils/uploadBase64Image.js";

interface EventRow {
  id: number;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  image: string;
  image_file_name: string;
  duration: string | null;
  type: string | null;
  registration_link: string;
  status: boolean;
  show_on_home: boolean | null;
}

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<EventRow>(
      `SELECT id, title, description, event_date, event_time,
              image, image_file_name, duration, type, registration_link, status, show_on_home
       FROM events
       WHERE event_date >= CURRENT_DATE
         AND status = true
         AND show_on_home = true
         AND (is_deleted = false OR is_deleted IS NULL)
       ORDER BY event_date ASC`
    );

    const items = result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      eventDate: r.event_date,
      eventTime: r.event_time,
      registrationLink: r.registration_link,
      status: r.status,
      image: r.image,
      imageFileName: resolveFileUrl(r.image_file_name, "events"),
      duration: r.duration,
      type: r.type,
      showOnHome: r.show_on_home ?? null,
    }));

    res.json(items);
  } catch (err) {
    console.error("Public Events GetUpcoming error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
