import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

const STAGE_CLOSED_NOT_INVESTED = 4;
const STAGE_CLOSED_INVESTED = 3;

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

export default router;
