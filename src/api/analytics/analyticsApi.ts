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

export interface AnalyticsConfigured {
  configured: true;
  range: AnalyticsRange;
  metrics?: AnalyticsMetrics;
  timeSeries?: AnalyticsTimeSeriesPoint[];
  funnel?: AnalyticsFunnelStep[];
  funnelEvents: string[];
  error?: string;
  detail?: string;
}

export type AnalyticsResponse = AnalyticsNotConfigured | AnalyticsConfigured;

export async function fetchAnalytics(range: AnalyticsRange): Promise<AnalyticsResponse> {
  try {
    const response = await axiosInstance.get<AnalyticsResponse>("/api/admin/analytics", {
      params: { range },
    });
    return response.data;
  } catch (err: any) {
    if (err?.response?.data) {
      return err.response.data as AnalyticsResponse;
    }
    throw err;
  }
}
