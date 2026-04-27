import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users as UsersIcon, DollarSign } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchGroupReports } from "../api/group/groupApi";
import { currency_format } from "@/helpers/format";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

function formatMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIdx)) return month;
  return MONTH_FORMAT.format(new Date(year, monthIdx, 1));
}

function formatThresholdLabel(threshold: number): string {
  if (threshold >= 1_000_000) return `$${threshold / 1_000_000}M+`;
  return `$${threshold / 1000}K+`;
}

export default function GroupReportsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/admin/group/reports"],
    queryFn: fetchGroupReports,
  });

  const membershipChartData = useMemo(() => {
    return (data?.cumulativeMembership || []).map((row) => ({
      ...row,
      label: formatMonth(row.month),
    }));
  }, [data]);

  const fundingChartData = useMemo(() => {
    return (data?.fundingBuckets || []).map((row) => ({
      ...row,
      label: formatThresholdLabel(row.threshold),
    }));
  }, [data]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/groups">
              <Button
                variant="outline"
                size="sm"
                className="text-[#405189] hover:text-[#405189] hover:bg-[#405189]/5"
                data-testid="button-back-to-groups"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Groups
              </Button>
            </Link>
            <h1
              className="text-2xl font-semibold"
              data-testid="text-page-heading"
            >
              Group Reports
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="card-summary-twoplus">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Groups With 2+ Members (Total)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="text-3xl font-semibold"
                data-testid="text-total-twoplus"
              >
                {isLoading ? "—" : data?.totals.groupsWithTwoOrMore ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-summary-invested">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Groups With Any Investment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="text-3xl font-semibold"
                data-testid="text-total-invested"
              >
                {isLoading ? "—" : data?.totals.groupsWithAnyInvestment ?? 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {isError && (
          <Card data-testid="card-error" className="border-destructive">
            <CardContent className="py-6 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Failed to load report data.</p>
                <p className="text-sm text-muted-foreground">
                  Please try again. If the problem persists, contact support.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => refetch()}
                data-testid="button-retry-reports"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-membership-chart">
          <CardHeader>
            <CardTitle>Cumulative Groups With 2+ Members</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Each bar shows the running total of groups that have reached at
              least two members by the end of that month.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : membershipChartData.length === 0 ? (
              <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                No membership data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={membershipChartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "cumulativeGroups")
                        return [value, "Cumulative Groups"];
                      if (name === "newGroups")
                        return [value, "Crossed 2+ This Month"];
                      return [value, name];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Bar
                    dataKey="cumulativeGroups"
                    fill="#405189"
                    name="cumulativeGroups"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-funding-chart">
          <CardHeader>
            <CardTitle>Groups By Member Investment Total</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Number of groups whose members have invested at or above each
              threshold.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : fundingChartData.length === 0 ? (
              <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                No funding data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={fundingChartData}
                  margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [value, "Groups"]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as
                        | { threshold: number }
                        | undefined;
                      if (!item) return label;
                      return `${currency_format(
                        item.threshold,
                        true,
                        0
                      )} or more`;
                    }}
                  />
                  <Bar
                    dataKey="groupCount"
                    fill="#0ab39c"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
