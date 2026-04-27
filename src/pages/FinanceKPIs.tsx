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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, CheckSquare, Layers } from "lucide-react";
import {
  fetchCumulativeAccountBalance,
  fetchCompletedInvestmentsKPI,
  fetchCompletedInvestmentsList,
  type CumulativeBalanceResponse,
  type CompletedInvestmentsResponse,
  type CompletedInvestmentsListResponse,
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

function bucketBounds(
  dateStr: string,
  granularity: "day" | "week" | "month",
): { startIso: string; endIso: string } {
  const start = new Date(dateStr + "T00:00:00.000Z");
  const end = new Date(start);
  if (granularity === "month") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else if (granularity === "week") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function bucketRangeLabel(dateStr: string, granularity: "day" | "week" | "month"): string {
  const start = new Date(dateStr + "T00:00:00Z");
  if (granularity === "month") {
    return start.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (granularity === "week") {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const opts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    };
    return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
  }
  return start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function granularityLabel(g: "day" | "week" | "month" | undefined): string {
  if (g === "month") return "monthly";
  if (g === "week") return "weekly";
  if (g === "day") return "daily";
  return "monthly";
}

function RangeSelector({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            data-testid={`${testId}-option-${opt.value}`}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CumulativeBalanceCard() {
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

  return (
    <Card data-testid="card-kpi-cumulative-balance">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b px-5 py-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-[#405189]" />
            Cumulative Money Added to Accounts
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Total deposits into user account balances over time ({granularityLabel(data?.granularity)} buckets)
          </p>
        </div>
        <div className="shrink-0">
          <RangeSelector value={range} onChange={setRange} testId="select-range-balance" />
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
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => compactCurrency(v)}
                  width={70}
                />
                <Tooltip
                  formatter={(value: number) => [currency_format(value), "Cumulative"]}
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
  );
}

interface DrilldownSelection {
  startIso: string;
  endIso: string;
  label: string;
}

type PerPeriodMetric = "count" | "amount";

function CompletedInvestmentsPerPeriodCard({
  onBarClick,
}: {
  onBarClick: (sel: DrilldownSelection) => void;
}) {
  const [range, setRange] = useState<string>("all");
  const [metric, setMetric] = useState<PerPeriodMetric>("count");

  const { data, isLoading, isError } = useQuery<CompletedInvestmentsResponse>({
    queryKey: ["/api/admin/finance/kpis/completed-investments", range],
    queryFn: () => fetchCompletedInvestmentsKPI(range),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.series.map((p) => ({
      ...p,
      label: formatBucketLabel(p.date, data.granularity),
    }));
  }, [data]);

  const periodCount = useMemo(() => {
    if (!data) return 0;
    return data.series.reduce((sum, p) => sum + p.count, 0);
  }, [data]);

  const periodAmount = useMemo(() => {
    if (!data) return 0;
    return data.series.reduce((sum, p) => sum + p.amount, 0);
  }, [data]);

  return (
    <Card data-testid="card-kpi-completed-per-period">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b px-5 py-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4 text-[#0ab39c]" />
            Completed Investments per Period
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {metric === "count" ? "Number of investments" : "Total dollar amount"} marked completed, grouped by {granularityLabel(data?.granularity)} period
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="inline-flex rounded-md border bg-muted/40 p-0.5"
            role="group"
            data-testid="toggle-per-period-metric"
          >
            <button
              type="button"
              onClick={() => setMetric("count")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                metric === "count"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="toggle-per-period-count"
            >
              Number
            </button>
            <button
              type="button"
              onClick={() => setMetric("amount")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                metric === "amount"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="toggle-per-period-amount"
            >
              Amount
            </button>
          </div>
          <RangeSelector value={range} onChange={setRange} testId="select-range-completed-per-period" />
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-md bg-[#0ab39c]/5 px-4 py-3">
            <p className="text-xs text-muted-foreground">Investments completed in range</p>
            <p
              className="text-xl font-bold tabular-nums text-[#0ab39c]"
              data-testid="text-period-completed-count"
            >
              {periodCount.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-[#405189]/5 px-4 py-3">
            <p className="text-xs text-muted-foreground">Total amount in range</p>
            <p
              className="text-xl font-bold tabular-nums text-[#405189]"
              data-testid="text-period-completed-amount"
            >
              {currency_format(periodAmount)}
            </p>
          </div>
        </div>

        <div className="h-[360px] w-full" data-testid="chart-completed-per-period">
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
              No completed investments in selected range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  allowDecimals={metric === "amount"}
                  width={metric === "amount" ? 70 : 50}
                  tickFormatter={
                    metric === "amount"
                      ? (v: number) => compactCurrency(v)
                      : (v: number) => v.toLocaleString()
                  }
                />
                <Tooltip
                  formatter={(value: number, _name: string, props) => {
                    const count = props?.payload?.count as number | undefined;
                    const amount = props?.payload?.amount as number | undefined;
                    if (metric === "amount") {
                      return [
                        `${currency_format(value)} (${(count ?? 0).toLocaleString()} investments)`,
                        "Completed",
                      ];
                    }
                    return [
                      `${value.toLocaleString()} (${currency_format(amount ?? 0)})`,
                      "Completed",
                    ];
                  }}
                  labelFormatter={(label: string) => label}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey={metric}
                  fill="#0ab39c"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={(entry: { date?: string; payload?: { date?: string } } | undefined) => {
                    const date = entry?.payload?.date ?? entry?.date;
                    if (!date || !data) return;
                    const { startIso, endIso } = bucketBounds(date, data.granularity);
                    onBarClick({
                      startIso,
                      endIso,
                      label: bucketRangeLabel(date, data.granularity),
                    });
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletedInvestmentsCumulativeCard({
  onBarClick,
}: {
  onBarClick: (sel: DrilldownSelection) => void;
}) {
  const [range, setRange] = useState<string>("all");

  const { data, isLoading, isError } = useQuery<CompletedInvestmentsResponse>({
    queryKey: ["/api/admin/finance/kpis/completed-investments", range],
    queryFn: () => fetchCompletedInvestmentsKPI(range),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.series.map((p) => ({
      ...p,
      label: formatBucketLabel(p.date, data.granularity),
    }));
  }, [data]);

  return (
    <Card data-testid="card-kpi-completed-cumulative">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b px-5 py-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-[#f7b84b]" />
            Cumulative Completed Investments
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Running total of investments marked completed over time ({granularityLabel(data?.granularity)} buckets)
          </p>
        </div>
        <div className="shrink-0">
          <RangeSelector value={range} onChange={setRange} testId="select-range-completed-cumulative" />
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-md bg-[#f7b84b]/10 px-4 py-3">
            <p className="text-xs text-muted-foreground">Cumulative completed (current)</p>
            <p
              className="text-xl font-bold tabular-nums text-[#f7b84b]"
              data-testid="text-cumulative-completed-count"
            >
              {(data?.currentCumulativeCount ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-[#405189]/5 px-4 py-3">
            <p className="text-xs text-muted-foreground">Cumulative amount</p>
            <p
              className="text-xl font-bold tabular-nums text-[#405189]"
              data-testid="text-cumulative-completed-amount"
            >
              {currency_format(data?.currentCumulativeAmount ?? 0)}
            </p>
          </div>
        </div>

        <div className="h-[360px] w-full" data-testid="chart-completed-cumulative">
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
              No completed investments in selected range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={50} />
                <Tooltip
                  formatter={(value: number, name: string, props) => {
                    const amount = props?.payload?.cumulativeAmount as number | undefined;
                    return [
                      `${value.toLocaleString()} (${currency_format(amount ?? 0)})`,
                      "Cumulative",
                    ];
                  }}
                  labelFormatter={(label: string) => label}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="cumulativeCount"
                  fill="#f7b84b"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  cursor="pointer"
                  onClick={(entry: { date?: string; payload?: { date?: string } } | undefined) => {
                    const date = entry?.payload?.date ?? entry?.date;
                    if (!date || !data) return;
                    const { startIso, endIso } = bucketBounds(date, data.granularity);
                    onBarClick({
                      startIso,
                      endIso,
                      label: bucketRangeLabel(date, data.granularity),
                    });
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompletedInvestmentsDrilldownDialog({
  selection,
  onClose,
}: {
  selection: DrilldownSelection | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery<CompletedInvestmentsListResponse>({
    queryKey: [
      "/api/admin/finance/kpis/completed-investments/list",
      selection?.startIso,
      selection?.endIso,
    ],
    queryFn: () =>
      fetchCompletedInvestmentsList(selection!.startIso, selection!.endIso),
    enabled: !!selection,
  });

  return (
    <Dialog open={!!selection} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="dialog-completed-drilldown">
        <DialogHeader>
          <DialogTitle>Completed Investments — {selection?.label ?? ""}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Loading..."
              : data
                ? `${data.count.toLocaleString()} ${data.count === 1 ? "investment" : "investments"} · ${currency_format(data.totalAmount)} total`
                : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto -mx-1 px-1">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading investments...</div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-destructive">Failed to load investments.</div>
          ) : !data || data.items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No completed investments in this period.
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="table-completed-drilldown">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Date</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Investment</th>
                  <th className="py-2 pl-3 font-medium text-muted-foreground text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-b last:border-b-0 align-top"
                    data-testid={`row-investment-${it.id}`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {it.dateOfLastInvestment
                        ? new Date(it.dateOfLastInvestment + "T00:00:00Z").toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
                          )
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium" data-testid={`text-investment-detail-${it.id}`}>
                        {it.investmentDetail || it.campaignName || `Investment #${it.id}`}
                      </div>
                      {it.campaignName && it.investmentDetail && (
                        <div className="text-xs text-muted-foreground">{it.campaignName}</div>
                      )}
                    </td>
                    <td
                      className="py-2 pl-3 text-right font-semibold tabular-nums"
                      data-testid={`text-investment-amount-${it.id}`}
                    >
                      {currency_format(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td colSpan={2} className="py-2 pr-3 text-right text-muted-foreground">
                    Total
                  </td>
                  <td
                    className="py-2 pl-3 text-right font-bold tabular-nums"
                    data-testid="text-drilldown-total"
                  >
                    {currency_format(data.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FinanceKPIs() {
  const [drilldown, setDrilldown] = useState<DrilldownSelection | null>(null);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
            Finance KPIs
          </h1>
        </div>

        <CumulativeBalanceCard />
        <CompletedInvestmentsPerPeriodCard onBarClick={setDrilldown} />
        <CompletedInvestmentsCumulativeCard onBarClick={setDrilldown} />

        <CompletedInvestmentsDrilldownDialog
          selection={drilldown}
          onClose={() => setDrilldown(null)}
        />
      </div>
    </AdminLayout>
  );
}
