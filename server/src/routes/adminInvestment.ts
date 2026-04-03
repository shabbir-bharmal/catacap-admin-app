import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

const InvestmentStageEnum: Record<string, number> = {
  Private: 1,
  Public: 2,
  ClosedInvested: 3,
  ClosedNotInvested: 4,
  New: 5,
  ComplianceReview: 6,
  CompletedOngoing: 7,
  Vetting: 8,
  CompletedOngoingPrivate: 9,
};

router.get("/types", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT id, name FROM investment_types ORDER BY name ASC`);
    const types = result.rows.map((r: any) => ({ id: Number(r.id), name: r.name }));
    types.push({ id: -1, name: "Other" });
    res.json(types);
  } catch (err: any) {
    console.error("Error fetching investment types:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/names", async (req: Request, res: Response) => {
  try {
    const stage = parseInt(String(req.query.stage || "0"), 10);
    const excludeId = parseInt(String(req.query.id || "0"), 10);

    if (stage === 4) {
      const result = await pool.query(
        `SELECT id, name, investment_types FROM campaigns
         WHERE stage != $1 AND TRIM(COALESCE(name, '')) != ''
         ORDER BY name ASC`,
        [InvestmentStageEnum.ClosedNotInvested]
      );

      const invTypesResult = await pool.query(`SELECT id, name FROM investment_types`);
      const invTypeMap: Record<number, string> = {};
      for (const t of invTypesResult.rows) invTypeMap[t.id] = t.name;

      const campaigns = result.rows.map((r: any) => {
        let isPrivateDebt = false;
        if (r.investment_types) {
          const ids = r.investment_types
            .split(",")
            .map((s: string) => parseInt(s.trim(), 10))
            .filter((n: number) => !isNaN(n));
          isPrivateDebt = ids.some((id: number) => {
            const name = invTypeMap[id];
            return name && name.includes("Private Debt");
          });
        }
        return { id: Number(r.id), name: r.name, isPrivateDebt };
      });

      res.json(campaigns);
    } else if (stage === 3) {
      const result = await pool.query(
        `SELECT id, name FROM campaigns
         WHERE stage = $1 AND TRIM(COALESCE(name, '')) != ''
         ORDER BY name ASC`,
        [InvestmentStageEnum.ClosedInvested]
      );
      res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name })));
    } else if (stage === 0) {
      const values: any[] = [];
      let condition = `TRIM(COALESCE(name, '')) != ''`;
      if (excludeId > 0) {
        values.push(excludeId);
        condition += ` AND id != $1`;
      }
      const result = await pool.query(
        `SELECT id, name FROM campaigns WHERE ${condition} ORDER BY name ASC`,
        values
      );
      res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name })));
    } else if (stage === 10) {
      const result = await pool.query(
        `SELECT id, name FROM campaigns
         WHERE stage IN ($1, $2, $3) AND TRIM(COALESCE(name, '')) != ''
         ORDER BY name ASC`,
        [
          InvestmentStageEnum.ClosedInvested,
          InvestmentStageEnum.CompletedOngoing,
          InvestmentStageEnum.CompletedOngoingPrivate,
        ]
      );
      res.json(result.rows.map((r: any) => ({ id: Number(r.id), name: r.name })));
    } else {
      res.status(400).json({ success: false, message: "Invalid investment stage." });
    }
  } catch (err: any) {
    console.error("Error fetching investment names:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
