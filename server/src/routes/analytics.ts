import { Router } from "express";
import type { Request, Response } from "express";
import {
  FUNNEL_EVENT_NAMES,
  getAnalyticsSnapshot,
  getDemoAnalyticsSnapshot,
  getGA4ConfigStatus,
  parseRange,
} from "../services/ga4Service.js";

function isDemoModeEnabled(): boolean {
  const flag = (process.env.GA4_DEMO_MODE ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  return process.env.NODE_ENV !== "production";
}

const router = Router();

function classifyGA4Error(err: unknown): string {
  const code = (err as { code?: number | string } | null)?.code;
  if (code === 7 || code === "PERMISSION_DENIED") {
    return "The GA4 service account does not have access to the configured property.";
  }
  if (code === 16 || code === "UNAUTHENTICATED") {
    return "GA4 credentials were rejected. Verify the service account email and private key.";
  }
  if (code === 5 || code === "NOT_FOUND") {
    return "The configured GA4 property could not be found.";
  }
  if (code === 3 || code === "INVALID_ARGUMENT") {
    return "GA4 rejected the request as invalid. Verify the property ID format.";
  }
  return "Unable to reach Google Analytics. Check the service account configuration.";
}

router.get("/", async (req: Request, res: Response) => {
  const range = parseRange(req.query.range);
  const status = getGA4ConfigStatus();

  if (!status.configured) {
    if (isDemoModeEnabled()) {
      const snapshot = getDemoAnalyticsSnapshot(range);
      res.json({
        configured: true,
        demo: true,
        missing: status.missing,
        range: snapshot.range,
        metrics: snapshot.metrics,
        timeSeries: snapshot.timeSeries,
        funnel: snapshot.funnel,
        funnelEvents: FUNNEL_EVENT_NAMES,
      });
      return;
    }
    res.json({
      configured: false,
      missing: status.missing,
      funnelEvents: FUNNEL_EVENT_NAMES,
    });
    return;
  }

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
    console.error("GA4 analytics error:", err);
    res.status(502).json({
      configured: true,
      error: "Failed to fetch Google Analytics data.",
      detail: classifyGA4Error(err),
      range,
      funnelEvents: FUNNEL_EVENT_NAMES,
    });
  }
});

export default router;
