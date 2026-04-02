import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

const FormType = {
  Companies: 1,
  Home: 2,
  ChampionDeal: 3,
  About: 4,
  Group: 5,
} as const;

interface SubmitFormBody {
  captchaToken?: string;
  formType: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  description?: string;
  launchPartners?: string;
  targetRaiseAmount?: string;
  selfRaiseAmountRange?: string;
}

interface InterestRow {
  id: number;
  value: string;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const dto: SubmitFormBody = req.body;

    if (dto.captchaToken) {
      const captchaValid = await verifyCaptcha(dto.captchaToken);
      if (!captchaValid) {
        res.json({ success: false, message: "CAPTCHA verification failed." });
        return;
      }
    }

    let description: string | null = null;

    if (dto.description && dto.formType === FormType.About) {
      const interests = dto.description
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

      const interestIds: number[] = [];

      for (const interest of interests) {
        const parsed = parseInt(interest, 10);
        if (!isNaN(parsed)) {
          interestIds.push(parsed);
        } else {
          const existing = await pool.query<{ id: number }>(
            `SELECT id FROM site_configurations WHERE type = 'Interest' AND LOWER(key) = LOWER($1)`,
            [interest]
          );

          if (existing.rows.length > 0) {
            interestIds.push(existing.rows[0].id);
          } else {
            const inserted = await pool.query<{ id: number }>(
              `INSERT INTO site_configurations (key, value, type) VALUES ($1, $2, $3) RETURNING id`,
              [interest, interest, "Interest-other"]
            );
            interestIds.push(inserted.rows[0].id);
          }
        }
      }

      description = interestIds.length > 0 ? interestIds.join(",") : null;
    } else if (dto.description) {
      description = dto.description.trim();
    }

    await pool.query(
      `INSERT INTO form_submissions
        (form_type, first_name, last_name, email, description, status,
         launch_partners, target_raise_amount, self_raise_amount_range, created_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, NOW())`,
      [
        dto.formType,
        dto.firstName,
        dto.lastName,
        dto.email,
        description,
        dto.launchPartners || null,
        dto.targetRaiseAmount || null,
        dto.selfRaiseAmountRange || null,
      ]
    );

    res.json({ success: true, message: "Your data has been submitted successfully." });
  } catch (err) {
    console.error("FormSubmission Submit error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<InterestRow>(
      `SELECT id, value FROM site_configurations WHERE type = 'Interest' ORDER BY value`
    );
    res.json(result.rows.map((r) => ({ id: r.id, value: r.value })));
  } catch (err) {
    console.error("FormSubmission GetInterest error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

async function verifyCaptcha(token: string): Promise<boolean> {
  try {
    const secret = process.env.CAPTCHA_SECRET_KEY;
    if (!secret) return false;

    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);

    const response = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      body: params,
    });

    const data = (await response.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export default router;
