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
  demo?: boolean;
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

const METRIC_NAMES = ["totalUsers", "sessions", "screenPageViews", "conversions"] as const;

async function fetchAggregateMetrics(
  client: BetaAnalyticsDataClient,
  property: string,
  startDate: string,
): Promise<GA4Metrics> {
  const [report] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate: "today" }],
    metrics: METRIC_NAMES.map((name) => ({ name })),
  });

  const row = report.rows?.[0];
  const read = (idx: number) => Number(row?.metricValues?.[idx]?.value ?? 0) || 0;
  return {
    totalUsers: read(0),
    sessions: read(1),
    screenPageViews: read(2),
    conversions: read(3),
  };
}

async function fetchTimeSeries(
  client: BetaAnalyticsDataClient,
  property: string,
  startDate: string,
): Promise<GA4TimeSeriesPoint[]> {
  const [report] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: METRIC_NAMES.map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  const timeSeries: GA4TimeSeriesPoint[] = [];
  for (const row of report.rows ?? []) {
    const rawDate = row.dimensionValues?.[0]?.value ?? "";
    const formattedDate =
      rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;
    const read = (idx: number) => Number(row.metricValues?.[idx]?.value ?? 0) || 0;
    timeSeries.push({
      date: formattedDate,
      totalUsers: read(0),
      sessions: read(1),
      screenPageViews: read(2),
      conversions: read(3),
    });
  }
  return timeSeries;
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

function buildDemoSnapshot(range: DateRangeKey): GA4Snapshot {
  const days = range === "30d" ? 30 : 7;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const seedFor = (offset: number, salt: number) => {
    const x = Math.sin(offset * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const timeSeries: GA4TimeSeriesPoint[] = [];
  let totalUsers = 0;
  let sessions = 0;
  let screenPageViews = 0;
  let conversions = 0;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const weekendFactor = dow === 0 || dow === 6 ? 0.7 : 1;
    const trend = 1 + (days - i) * 0.01;

    const users = Math.round((180 + seedFor(i, 1) * 220) * weekendFactor * trend);
    const sess = Math.round(users * (1.25 + seedFor(i, 2) * 0.4));
    const views = Math.round(sess * (2.4 + seedFor(i, 3) * 1.1));
    const conv = Math.round(users * (0.04 + seedFor(i, 4) * 0.05));

    timeSeries.push({
      date: iso,
      totalUsers: users,
      sessions: sess,
      screenPageViews: views,
      conversions: conv,
    });
    totalUsers += users;
    sessions += sess;
    screenPageViews += views;
    conversions += conv;
  }

  const aggregateUsers = Math.round(totalUsers * 0.78);

  const funnel: GA4FunnelStep[] = FUNNEL_EVENT_NAMES.map((eventName, index) => {
    const baseCounts: Record<string, number> = {
      page_view: screenPageViews,
      sign_up: Math.round(aggregateUsers * 0.18),
      purchase: Math.round(aggregateUsers * 0.06),
    };
    const fallback = Math.round(screenPageViews / Math.pow(3, index + 1));
    const count = baseCounts[eventName] ?? fallback;
    let dropOffPercentage: number | null = null;
    if (index > 0) {
      const previousName = FUNNEL_EVENT_NAMES[index - 1];
      const previousCount = baseCounts[previousName] ?? Math.round(screenPageViews / Math.pow(3, index));
      if (previousCount > 0) {
        const drop = ((previousCount - count) / previousCount) * 100;
        dropOffPercentage = Math.max(0, Math.round(drop * 100) / 100);
      } else {
        dropOffPercentage = 0;
      }
    }
    return { eventName, count, dropOffPercentage };
  });

  return {
    range,
    demo: true,
    metrics: {
      totalUsers: aggregateUsers,
      sessions,
      screenPageViews,
      conversions,
    },
    timeSeries,
    funnel,
  };
}

export function getDemoAnalyticsSnapshot(range: DateRangeKey): GA4Snapshot {
  return buildDemoSnapshot(range);
}

export async function getAnalyticsSnapshot(range: DateRangeKey): Promise<GA4Snapshot> {
  const cached = snapshotCache.get(range);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const client = buildClient();
  const property = getPropertyName();
  const startDate = rangeToStartDate(range);

  const [metrics, timeSeries, funnel] = await Promise.all([
    fetchAggregateMetrics(client, property, startDate),
    fetchTimeSeries(client, property, startDate),
    fetchFunnel(client, property, startDate),
  ]);

  const snapshot: GA4Snapshot = {
    range,
    metrics,
    timeSeries,
    funnel,
  };

  snapshotCache.set(range, { expiresAt: Date.now() + CACHE_TTL_MS, data: snapshot });
  return snapshot;
}

export function clearAnalyticsCache(): void {
  snapshotCache.clear();
}
