import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import {
  fetchCumulativeAccountBalance,
  type CumulativeBalanceResponse,
} from "../api/finance/financeApi";
import { currency_format } from "../helpers/format";

const RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Time" },
  { value: "5y", label: "Last 5 Years" },
  { value: "3y", label: "Last 3 Years" },
  { value: "1y", label: "Last 1 Year" },
  { value: "6m", label: "Last 6 Months" },
  { value: "3m", label: "Last 3 Months" },
  { value: "1m", label: "Last 1 Month" },
];

function formatBucketLabel(dateStr: string, granularity: "day" | "week" | "month"): string {
  const d = new Date(dateStr + "T00:00:00Z");
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (granularity === "week") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function compactCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function FinanceKPIs() {
  const [range, setRange] = useState<string>("all");

  const { data, isLoading, isError } = useQuery<CumulativeBalanceResponse>({
    queryKey: ["/api/admin/finance/kpis/account-balance-cumulative", range],
    queryFn: () => fetchCumulativeAccountBalance(range),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.series.map((p) => ({
      ...p,
      label: formatBucketLabel(p.date, data.granularity),
    }));
  }, [data]);

  const periodAdded = useMemo(() => {
    if (!data) return 0;
    return data.series.reduce((sum, p) => sum + p.added, 0);
  }, [data]);

  const granularityLabel =
    data?.granularity === "month"
      ? "monthly"
      : data?.granularity === "week"
        ? "weekly"
        : "daily";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
            Finance KPIs
          </h1>
        </div>

        <Card data-testid="card-kpi-cumulative-balance">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b px-5 py-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-[#405189]" />
                Cumulative Money Added to Accounts
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Total deposits into user account balances over time ({granularityLabel} buckets)
              </p>
            </div>
            <div className="shrink-0">
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-[160px]" data-testid="select-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} data-testid={`option-range-${opt.value}`}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="rounded-md bg-[#405189]/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">Cumulative total (current)</p>
                <p
                  className="text-xl font-bold tabular-nums text-[#405189]"
                  data-testid="text-cumulative-total"
                >
                  {currency_format(data?.currentCumulative ?? 0)}
                </p>
              </div>
              <div className="rounded-md bg-[#0ab39c]/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">Added in selected range</p>
                <p
                  className="text-xl font-bold tabular-nums text-[#0ab39c]"
                  data-testid="text-period-added"
                >
                  {currency_format(periodAdded)}
                </p>
              </div>
            </div>

            <div className="h-[420px] w-full" data-testid="chart-cumulative-balance">
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading chart...
                </div>
              ) : isError ? (
                <div className="flex h-full items-center justify-center text-sm text-destructive">
                  Failed to load chart data.
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No data in selected range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="kpiCumulative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#405189" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#405189" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => compactCurrency(v)}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        currency_format(value),
                        name === "cumulative" ? "Cumulative" : "Added this period",
                      ]}
                      labelFormatter={(label: string) => label}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke="#405189"
                      strokeWidth={2}
                      fill="url(#kpiCumulative)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
