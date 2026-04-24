import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Loader2,
  MousePointerClick,
  RefreshCcw,
  Target,
  TrendingDown,
  Users,
} from "lucide-react";
import {
  fetchAnalytics,
  type AnalyticsRange,
  type AnalyticsResponse,
} from "@/api/analytics/analyticsApi";

type TrendMetricKey = "totalUsers" | "sessions" | "screenPageViews" | "conversions";

const METRIC_LABELS: Record<TrendMetricKey, string> = {
  totalUsers: "Users",
  sessions: "Sessions",
  screenPageViews: "Pageviews",
  conversions: "Conversions",
};

const METRIC_ICONS: Record<TrendMetricKey, React.ComponentType<{ className?: string }>> = {
  totalUsers: Users,
  sessions: MousePointerClick,
  screenPageViews: BarChart3,
  conversions: Target,
};

const METRIC_COLOR: Record<TrendMetricKey, string> = {
  totalUsers: "#0ab39c",
  sessions: "#299cdb",
  screenPageViews: "#405189",
  conversions: "#f7b84b",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatChartDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getEnvLabel(key: string): string {
  const labels: Record<string, string> = {
    GA4_PROPERTY_ID: "GA4 Property ID (numeric ID from Google Analytics)",
    GA4_CLIENT_EMAIL: "Service account client email",
    GA4_PRIVATE_KEY: "Service account private key (paste as-is, including newlines)",
    GA4_PROJECT_ID: "Google Cloud project ID",
  };
  return labels[key] || key;
}

interface MetricCardProps {
  label: string;
  value: number;
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}

function MetricCard({ label, value, Icon, iconColor }: MetricCardProps) {
  return (
    <Card data-testid={`card-metric-${label.toLowerCase()}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{ backgroundColor: `${iconColor}1f` }}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <h4 className="mt-3 text-[22px] font-semibold leading-none">{formatNumber(value)}</h4>
      </CardContent>
    </Card>
  );
}

interface NotConfiguredProps {
  missing: string[];
}

function NotConfigured({ missing }: NotConfiguredProps) {
  return (
    <Card data-testid="card-analytics-not-configured">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Google Analytics is not configured
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          To start showing GA4 metrics on this page, an admin needs to add the following secrets in
          Replit. After saving them, reload this page.
        </p>
        <div className="rounded-md border bg-muted/40 p-4">
          <p className="mb-2 font-medium">Setup steps</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Open the Replit workspace.</li>
            <li>Click <span className="font-mono">Tools</span> in the left sidebar, then choose <span className="font-mono">Secrets</span>.</li>
            <li>Add each missing key below as a new secret with its value.</li>
            <li>Restart the server (or republish the deployment) and reload this page.</li>
          </ol>
        </div>
        <div>
          <p className="mb-2 font-medium">Missing secrets</p>
          <ul className="space-y-2">
            {missing.map((key) => (
              <li key={key} className="rounded border bg-card p-3" data-testid={`row-missing-${key}`}>
                <p className="font-mono text-xs font-semibold">{key}</p>
                <p className="mt-1 text-xs text-muted-foreground">{getEnvLabel(key)}</p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

interface FunnelChartProps {
  steps: Array<{ eventName: string; count: number; dropOffPercentage: number | null }>;
}

function FunnelChart({ steps }: FunnelChartProps) {
  const maxCount = steps.reduce((acc, step) => Math.max(acc, step.count), 0);
  return (
    <div className="space-y-3" data-testid="chart-funnel">
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No funnel events configured.</p>
      ) : (
        steps.map((step, index) => {
          const widthPct = maxCount === 0 ? 0 : Math.max(4, (step.count / maxCount) * 100);
          return (
            <div key={`${step.eventName}-${index}`} data-testid={`row-funnel-${step.eventName}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="font-mono">{step.eventName}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {step.dropOffPercentage !== null && (
                    <span className="inline-flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-[#f06548]" />
                      {step.dropOffPercentage}% drop-off
                    </span>
                  )}
                  <span className="font-semibold text-foreground">{formatNumber(step.count)}</span>
                </div>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-[#0ab39c]"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>("totalUsers");

  const query = useQuery<AnalyticsResponse>({
    queryKey: ["analytics", range],
    queryFn: () => fetchAnalytics(range),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const isLoading = query.isLoading;
  const isFetching = query.isFetching;

  return (
    <AdminLayout title="Analytics">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-semibold" data-testid="text-analytics-heading">
              Analytics
            </h4>
            <p className="text-sm text-muted-foreground">
              Site engagement powered by Google Analytics 4.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
              <SelectTrigger className="h-9 w-[160px]" data-testid="select-analytics-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={isFetching}
              data-testid="button-analytics-refresh"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <Card data-testid="card-analytics-error">
            <CardContent className="p-6 text-sm text-destructive">
              Failed to load analytics. Please try again.
            </CardContent>
          </Card>
        ) : data.configured === false ? (
          <NotConfigured missing={data.missing} />
        ) : data.error || !data.metrics || !data.timeSeries || !data.funnel ? (
          <Card data-testid="card-analytics-error">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Could not load Google Analytics data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-destructive">{data.error}</p>
              {data.detail && (
                <p className="rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
                  {data.detail}
                </p>
              )}
              <p className="text-muted-foreground">
                Verify the GA4 service account has access to the configured property and that the
                secret values are correct.
              </p>
            </CardContent>
          </Card>
        ) : (
          <AnalyticsContent
            metrics={data.metrics!}
            timeSeries={data.timeSeries!}
            funnel={data.funnel!}
            funnelEvents={data.funnelEvents}
            trendMetric={trendMetric}
            onTrendMetricChange={setTrendMetric}
          />
        )}
      </div>
    </AdminLayout>
  );
}

interface AnalyticsContentProps {
  metrics: AnalyticsMetricsLike;
  timeSeries: AnalyticsTimeSeriesPointLike[];
  funnel: AnalyticsFunnelStepLike[];
  funnelEvents: string[];
  trendMetric: TrendMetricKey;
  onTrendMetricChange: (value: TrendMetricKey) => void;
}

type AnalyticsMetricsLike = Record<TrendMetricKey, number>;
type AnalyticsTimeSeriesPointLike = { date: string } & Record<TrendMetricKey, number>;
type AnalyticsFunnelStepLike = { eventName: string; count: number; dropOffPercentage: number | null };

function AnalyticsContent({
  metrics,
  timeSeries,
  funnel,
  funnelEvents,
  trendMetric,
  onTrendMetricChange,
}: AnalyticsContentProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(METRIC_LABELS) as TrendMetricKey[]).map((key) => (
          <MetricCard
            key={key}
            label={METRIC_LABELS[key]}
            value={metrics[key]}
            Icon={METRIC_ICONS[key]}
            iconColor={METRIC_COLOR[key]}
          />
        ))}
      </div>

      <Card data-testid="card-analytics-trend">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-md font-semibold">Trend</CardTitle>
          <Select value={trendMetric} onValueChange={(v) => onTrendMetricChange(v as TrendMetricKey)}>
            <SelectTrigger className="h-8 w-[160px]" data-testid="select-trend-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METRIC_LABELS) as TrendMetricKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {METRIC_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={METRIC_COLOR[trendMetric]} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={METRIC_COLOR[trendMetric]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(label) => formatChartDate(String(label))}
                  formatter={(value: number) => [formatNumber(value), METRIC_LABELS[trendMetric]]}
                />
                <Area
                  type="monotone"
                  dataKey={trendMetric}
                  stroke={METRIC_COLOR[trendMetric]}
                  strokeWidth={2}
                  fill="url(#analyticsGradient)"
                  name={METRIC_LABELS[trendMetric]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-analytics-funnel">
        <CardHeader>
          <CardTitle className="text-md font-semibold">Conversion Funnel</CardTitle>
          <p className="text-xs text-muted-foreground">
            Step counts for events: {funnelEvents.join(" → ")}
          </p>
        </CardHeader>
        <CardContent>
          <FunnelChart steps={funnel} />
        </CardContent>
      </Card>
    </>
  );
}
