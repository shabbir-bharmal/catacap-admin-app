import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

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
}

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<EventRow>(
      `SELECT id, title, description, event_date, event_time,
              image, image_file_name, duration, type, registration_link, status
       FROM events
       WHERE event_date >= CURRENT_DATE AND status = true AND (is_deleted = false OR is_deleted IS NULL)
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
      imageFileName: r.image_file_name,
      duration: r.duration,
      type: r.type,
    }));

    res.json(items);
  } catch (err) {
    console.error("Public Events GetUpcoming error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
