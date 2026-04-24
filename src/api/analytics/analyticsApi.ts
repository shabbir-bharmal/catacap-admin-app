import axios from "axios";
import axiosInstance from "../axios";

export type AnalyticsRange = "7d" | "30d";

export interface AnalyticsMetrics {
  totalUsers: number;
  sessions: number;
  screenPageViews: number;
  conversions: number;
}

export interface AnalyticsTimeSeriesPoint {
  date: string;
  totalUsers: number;
  sessions: number;
  screenPageViews: number;
  conversions: number;
}

export interface AnalyticsFunnelStep {
  eventName: string;
  count: number;
  dropOffPercentage: number | null;
}

export interface AnalyticsNotConfigured {
  configured: false;
  missing: string[];
  funnelEvents: string[];
}

export interface AnalyticsConfiguredSuccess {
  configured: true;
  range: AnalyticsRange;
  funnelEvents: string[];
  metrics: AnalyticsMetrics;
  timeSeries: AnalyticsTimeSeriesPoint[];
  funnel: AnalyticsFunnelStep[];
}

export interface AnalyticsConfiguredError {
  configured: true;
  range: AnalyticsRange;
  funnelEvents: string[];
  error: string;
  detail?: string;
}

export type AnalyticsResponse =
  | AnalyticsNotConfigured
  | AnalyticsConfiguredSuccess
  | AnalyticsConfiguredError;

export function isAnalyticsError(
  response: AnalyticsResponse,
): response is AnalyticsConfiguredError {
  return response.configured === true && "error" in response;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseRangeValue(value: unknown, fallback: AnalyticsRange): AnalyticsRange {
  return value === "7d" || value === "30d" ? value : fallback;
}

function normalizeAnalyticsResponse(
  payload: unknown,
  fallbackRange: AnalyticsRange,
): AnalyticsResponse | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const funnelEvents = isStringArray(obj.funnelEvents) ? obj.funnelEvents : [];

  if (obj.configured === false) {
    const missing = isStringArray(obj.missing) ? obj.missing : [];
    return { configured: false, missing, funnelEvents };
  }

  if (obj.configured === true) {
    const range = parseRangeValue(obj.range, fallbackRange);
    if (typeof obj.error === "string") {
      return {
        configured: true,
        range,
        funnelEvents,
        error: obj.error,
        detail: typeof obj.detail === "string" ? obj.detail : undefined,
      };
    }
    if (
      obj.metrics &&
      typeof obj.metrics === "object" &&
      Array.isArray(obj.timeSeries) &&
      Array.isArray(obj.funnel)
    ) {
      return {
        configured: true,
        range,
        funnelEvents,
        metrics: obj.metrics as AnalyticsMetrics,
        timeSeries: obj.timeSeries as AnalyticsTimeSeriesPoint[],
        funnel: obj.funnel as AnalyticsFunnelStep[],
      };
    }
  }

  return null;
}

export async function fetchAnalytics(range: AnalyticsRange): Promise<AnalyticsResponse> {
  try {
    const response = await axiosInstance.get<unknown>("/api/admin/analytics", {
      params: { range },
    });
    const normalized = normalizeAnalyticsResponse(response.data, range);
    if (normalized) return normalized;
    return {
      configured: true,
      range,
      funnelEvents: [],
      error: "Unexpected response from analytics endpoint.",
    };
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const normalized = normalizeAnalyticsResponse(err.response?.data, range);
      if (normalized) return normalized;
      return {
        configured: true,
        range,
        funnelEvents: [],
        error: "Failed to fetch analytics.",
        detail: err.message,
      };
    }
    return {
      configured: true,
      range,
      funnelEvents: [],
      error: "Failed to fetch analytics.",
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}
