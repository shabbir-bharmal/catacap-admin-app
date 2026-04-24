import { Router } from "express";
import type { Request, Response } from "express";
import {
  FUNNEL_EVENT_NAMES,
  getAnalyticsSnapshot,
  getGA4ConfigStatus,
  parseRange,
} from "../services/ga4Service.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const status = getGA4ConfigStatus();
  if (!status.configured) {
    res.json({
      configured: false,
      missing: status.missing,
      funnelEvents: FUNNEL_EVENT_NAMES,
    });
    return;
  }

  const range = parseRange(req.query.range);

  try {
    const snapshot = await getAnalyticsSnapshot(range);
    res.json({
      configured: true,
      range: snapshot.range,
      metrics: snapshot.metrics,
      timeSeries: snapshot.timeSeries,
      funnel: snapshot.funnel,
      funnelEvents: FUNNEL_EVENT_NAMES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("GA4 analytics error:", err);
    res.status(502).json({
      configured: true,
      error: "Failed to fetch Google Analytics data.",
      detail: message,
      range,
      funnelEvents: FUNNEL_EVENT_NAMES,
    });
  }
});

export default router;
