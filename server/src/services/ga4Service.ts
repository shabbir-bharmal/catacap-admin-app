import { BetaAnalyticsDataClient } from "@google-analytics/data";

export const REQUIRED_GA4_ENV_KEYS = [
  "GA4_PROPERTY_ID",
  "GA4_CLIENT_EMAIL",
  "GA4_PRIVATE_KEY",
  "GA4_PROJECT_ID",
] as const;

export const FUNNEL_EVENT_NAMES: string[] = ["page_view", "sign_up", "purchase"];

export type DateRangeKey = "7d" | "30d";

export interface GA4Metrics {
  totalUsers: number;
  sessions: number;
  screenPageViews: number;
  conversions: number;
}

export interface GA4TimeSeriesPoint {
  date: string;
  totalUsers: number;
  sessions: number;
  screenPageViews: number;
  conversions: number;
}

export interface GA4FunnelStep {
  eventName: string;
  count: number;
  dropOffPercentage: number | null;
}

export interface GA4Snapshot {
  range: DateRangeKey;
  metrics: GA4Metrics;
  timeSeries: GA4TimeSeriesPoint[];
  funnel: GA4FunnelStep[];
}

export interface GA4ConfigStatus {
  configured: boolean;
  missing: string[];
}

export function getGA4ConfigStatus(): GA4ConfigStatus {
  const missing = REQUIRED_GA4_ENV_KEYS.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });
  return { configured: missing.length === 0, missing: [...missing] };
}

function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n");
  return key;
}

let cachedClient: BetaAnalyticsDataClient | null = null;
let cachedClientFingerprint = "";

function buildClient(): BetaAnalyticsDataClient {
  const clientEmail = process.env.GA4_CLIENT_EMAIL!.trim();
  const projectId = process.env.GA4_PROJECT_ID!.trim();
  const privateKey = normalizePrivateKey(process.env.GA4_PRIVATE_KEY!);
  const fingerprint = `${projectId}:${clientEmail}:${privateKey.length}`;

  if (cachedClient && cachedClientFingerprint === fingerprint) {
    return cachedClient;
  }

  cachedClient = new BetaAnalyticsDataClient({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
  cachedClientFingerprint = fingerprint;
  return cachedClient;
}

function getPropertyName(): string {
  const id = process.env.GA4_PROPERTY_ID!.trim();
  if (id.startsWith("properties/")) return id;
  return `properties/${id}`;
}

function rangeToStartDate(range: DateRangeKey): string {
  return range === "30d" ? "29daysAgo" : "6daysAgo";
}

interface CacheEntry {
  expiresAt: number;
  data: GA4Snapshot;
}

const CACHE_TTL_MS = 60 * 1000;
const snapshotCache = new Map<string, CacheEntry>();

function pickRange(value: unknown): DateRangeKey {
  return value === "30d" ? "30d" : "7d";
}

export function parseRange(value: unknown): DateRangeKey {
  return pickRange(value);
}

async function fetchMetricsAndTimeSeries(
  client: BetaAnalyticsDataClient,
  property: string,
  startDate: string,
): Promise<{ metrics: GA4Metrics; timeSeries: GA4TimeSeriesPoint[] }> {
  const [report] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "conversions" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  const timeSeries: GA4TimeSeriesPoint[] = [];
  let totalUsers = 0;
  let sessions = 0;
  let screenPageViews = 0;
  let conversions = 0;

  for (const row of report.rows ?? []) {
    const rawDate = row.dimensionValues?.[0]?.value ?? "";
    const formattedDate =
      rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;
    const u = Number(row.metricValues?.[0]?.value ?? 0) || 0;
    const s = Number(row.metricValues?.[1]?.value ?? 0) || 0;
    const v = Number(row.metricValues?.[2]?.value ?? 0) || 0;
    const c = Number(row.metricValues?.[3]?.value ?? 0) || 0;
    timeSeries.push({
      date: formattedDate,
      totalUsers: u,
      sessions: s,
      screenPageViews: v,
      conversions: c,
    });
    totalUsers += u;
    sessions += s;
    screenPageViews += v;
    conversions += c;
  }

  return {
    metrics: { totalUsers, sessions, screenPageViews, conversions },
    timeSeries,
  };
}

async function fetchFunnel(
  client: BetaAnalyticsDataClient,
  property: string,
  startDate: string,
): Promise<GA4FunnelStep[]> {
  if (FUNNEL_EVENT_NAMES.length === 0) return [];
  const [report] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate: "today" }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: FUNNEL_EVENT_NAMES },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const row of report.rows ?? []) {
    const name = row.dimensionValues?.[0]?.value ?? "";
    const value = Number(row.metricValues?.[0]?.value ?? 0) || 0;
    counts.set(name, value);
  }

  return FUNNEL_EVENT_NAMES.map((eventName, index) => {
    const count = counts.get(eventName) ?? 0;
    let dropOffPercentage: number | null = null;
    if (index > 0) {
      const previousCount = counts.get(FUNNEL_EVENT_NAMES[index - 1]) ?? 0;
      if (previousCount > 0) {
        const drop = ((previousCount - count) / previousCount) * 100;
        dropOffPercentage = Math.max(0, Math.round(drop * 100) / 100);
      } else {
        dropOffPercentage = count === 0 ? 0 : null;
      }
    }
    return { eventName, count, dropOffPercentage };
  });
}

export async function getAnalyticsSnapshot(range: DateRangeKey): Promise<GA4Snapshot> {
  const cached = snapshotCache.get(range);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const client = buildClient();
  const property = getPropertyName();
  const startDate = rangeToStartDate(range);

  const [metricsAndSeries, funnel] = await Promise.all([
    fetchMetricsAndTimeSeries(client, property, startDate),
    fetchFunnel(client, property, startDate),
  ]);

  const snapshot: GA4Snapshot = {
    range,
    metrics: metricsAndSeries.metrics,
    timeSeries: metricsAndSeries.timeSeries,
    funnel,
  };

  snapshotCache.set(range, { expiresAt: Date.now() + CACHE_TTL_MS, data: snapshot });
  return snapshot;
}

export function clearAnalyticsCache(): void {
  snapshotCache.clear();
}
