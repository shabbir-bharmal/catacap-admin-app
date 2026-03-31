import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  Users,
  UsersRound,
  TrendingUp,
  Landmark,
  Leaf,
  FileText,
  Scale,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchFinanceData, exportFinanceData, FinanceData } from "../api/finance/financeApi";
import { currency_format } from "../helpers/format";

interface RowData {
  label: string;
  value: string;
  highlight?: boolean;
}

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function buildTopStats(data: FinanceData): StatCard[] {
  return [
    { label: "Total User Investments + Balances", value: currency_format(data.users.investmentsPlusAccountBalances ?? 0), icon: <Users className="h-5 w-5" />, color: "bg-[#405189]/10 text-[#405189]" },
    { label: "Total Recommendations", value: currency_format(data.recommendations.total ?? 0), icon: <TrendingUp className="h-5 w-5" />, color: "bg-[#0ab39c]/10 text-[#0ab39c]" },
    { label: "Total CataCap Assets", value: currency_format(data.investments.assets ?? 0), icon: <Landmark className="h-5 w-5" />, color: "bg-[#f7b84b]/10 text-[#f7b84b]" },
    { label: "Pending Grants & Assets", value: currency_format((data.grants.pendingAndInTransit ?? 0) + (data.grants.pendingAndInTransitOtherAssets ?? 0)), icon: <FileText className="h-5 w-5" />, color: "bg-[#f06548]/10 text-[#f06548]" },
  ];
}

function buildUsersRows(data: FinanceData): RowData[] {
  return [
    { label: "Total active users", value: (data.users.active ?? 0).toLocaleString() },
    { label: "Total inactive users", value: (data.users.inactive ?? 0).toLocaleString() },
    { label: "Total user account balances", value: currency_format(data.users.accountBalances ?? 0) },
    { label: "Total user investments", value: currency_format(data.users.investments ?? 0) },
  ];
}

function buildGroupsRows(data: FinanceData): RowData[] {
  return [
    {
      label: "Investment groups (group leaders)",
      value: `${(data.groups.investments ?? 0).toLocaleString()} (${(data.groups.leaders ?? 0).toLocaleString()})`
    },
    { label: "Total group members", value: (data.groups.members ?? 0).toLocaleString() },
    { label: "Total corporate groups", value: (data.groups.corporate ?? 0).toLocaleString() },
  ];
}

function buildRecommendationsRows(data: FinanceData): RowData[] {
  return [
    { label: "Total pending", value: currency_format(data.recommendations.pending ?? 0) },
    { label: "Total approved", value: currency_format(data.recommendations.approved ?? 0) },
    { label: "Approved & pending count", value: (data.recommendations.approvedAndPending ?? 0).toLocaleString() },
    { label: "Total rejected", value: currency_format(data.recommendations.rejected ?? 0) },
  ];
}

function buildInvestmentsRows(data: FinanceData): RowData[] {
  return [
    { label: "Average investment amount", value: currency_format(data.investments.average ?? 0) },
    { label: "Total active investments", value: (data.investments.active ?? 0).toLocaleString() },
    { label: "Active investments over $25K", value: (data.investments.over25K ?? 0).toLocaleString() },
    { label: "Active investments over $50K", value: (data.investments.over50K ?? 0).toLocaleString() },
    { label: "Total completed investments", value: (data.investments.completed ?? 0).toLocaleString() },
    { label: "Active investments total", value: currency_format(data.investments.totalActive ?? 0), highlight: true },
    { label: "Completed investments total", value: currency_format(data.investments.totalCompleted ?? 0), highlight: true },
    { label: "Active & closed total", value: currency_format(data.investments.totalActiveAndClosed ?? 0), highlight: true },
  ];
}

function buildThemeRows(data: FinanceData): RowData[] {
  return (data.investmentThemes ?? []).map((theme) => ({
    label: theme.name,
    value: currency_format(theme.total ?? 0),
  }));
}

function buildGrantsRows(data: FinanceData): RowData[] {
  return [
    { label: "Pending & in transit grants", value: currency_format(data.grants.pendingAndInTransit ?? 0) },
    { label: "Pending & in transit other assets", value: currency_format(data.grants.pendingAndInTransitOtherAssets ?? 0) },
  ];
}

function SectionCard({
  title,
  icon,
  rows,
  testIdPrefix,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  rows: RowData[];
  testIdPrefix: string;
  footer?: { label: string; value: string };
}) {
  return (
    <Card className="flex flex-col" data-testid={`card-${testIdPrefix}`}>
      <CardHeader className="flex flex-row items-center gap-2 border-b px-5 py-3">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground" data-testid={`text-section-${testIdPrefix}`}>{title}</h3>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <table className="w-full" data-testid={`table-${testIdPrefix}`}>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className={`border-b last:border-b-0 ${row.highlight ? "bg-muted/30" : ""}`}
                data-testid={`row-${testIdPrefix}-${idx}`}
              >
                <td className={`px-5 py-2.5 text-sm ${row.highlight ? "font-semibold" : ""}`} data-testid={`text-label-${testIdPrefix}-${idx}`}>
                  {row.label}
                </td>
                <td className={`px-5 py-2.5 text-sm text-right tabular-nums ${row.highlight ? "font-semibold" : "text-muted-foreground"}`} data-testid={`text-value-${testIdPrefix}-${idx}`}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer && (
          <div className="flex items-center justify-between px-5 py-3 bg-[#405189]/5 border-t" data-testid={`footer-${testIdPrefix}`}>
            <span className="text-sm font-bold">{footer.label}</span>
            <span className="text-sm font-bold tabular-nums">{footer.value}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminConsolidatedFinances() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["consolidatedFinances"],
    queryFn: fetchFinanceData,
    staleTime: 0,
    gcTime: 0,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportFinanceData();
      toast({
        title: "The consolidated finances data has been exported.",
        duration: 4000,
      });
    } catch {
      toast({
        title: "Failed to export consolidated finances.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading consolidated finances...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-red-500 font-medium">Error loading consolidated finances.</p>
        </div>
      </AdminLayout>
    );
  }

  const topStats = buildTopStats(data);
  const usersRows = buildUsersRows(data);
  const groupsRows = buildGroupsRows(data);
  const recommendationsRows = buildRecommendationsRows(data);
  const investmentsRows = buildInvestmentsRows(data);
  const themeRows = buildThemeRows(data);
  const grantsRows = buildGrantsRows(data);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">Consolidated Finances</h1>
          <Button
            size="sm"
            className="bg-[#405189] text-white"
            data-testid="button-export-all"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {isExporting ? "Exporting..." : "Export All"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {topStats.map((stat, idx) => (
            <Card key={idx} data-testid={`card-stat-${idx}`}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex items-center justify-center w-11 h-11 rounded-md ${stat.color}`}>
                  {stat.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                  <p className="text-lg font-bold tabular-nums">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            title="Users"
            icon={<Users className="h-4 w-4" />}
            rows={usersRows}
            testIdPrefix="users"
            footer={{ label: "Total Investments + Balances", value: currency_format(data.users.investmentsPlusAccountBalances) }}
          />
          <SectionCard
            title="Recommendations"
            icon={<TrendingUp className="h-4 w-4" />}
            rows={recommendationsRows}
            testIdPrefix="recommendations"
            footer={{ label: "Total Recommendations", value: currency_format(data.recommendations.total) }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            title="Groups"
            icon={<UsersRound className="h-4 w-4" />}
            rows={groupsRows}
            testIdPrefix="groups"
          />
          <SectionCard
            title="Grants and Other Assets"
            icon={<FileText className="h-4 w-4" />}
            rows={grantsRows}
            testIdPrefix="grants"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            title="Investments"
            icon={<Landmark className="h-4 w-4" />}
            rows={investmentsRows}
            testIdPrefix="investments"
            footer={{ label: "Total CataCap Assets (Balances + Recommendations)", value: currency_format(data.investments.assets) }}
          />
          <SectionCard
            title="Investments by Theme"
            icon={<Leaf className="h-4 w-4" />}
            rows={themeRows}
            testIdPrefix="themes"
          />
        </div>

        <Card data-testid="card-balance">
          <CardHeader className="flex flex-row items-center gap-2 border-b px-5 py-3">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground" data-testid="text-section-balance">To Balance</h3>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full" data-testid="table-balance">
              <thead>
                <tr className="bg-[#405189] text-white">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" data-testid="th-balance-recommendations">Total Recommendations</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" data-testid="th-balance-investments">Total Active & Closed Investments</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" data-testid="th-balance-difference">Difference</th>
                </tr>
              </thead>
              <tbody>
                <tr data-testid="row-balance-0">
                  <td className="px-5 py-3 text-sm font-semibold tabular-nums" data-testid="text-balance-recommendations">{currency_format(data.toBalance.recommendations)}</td>
                  <td className="px-5 py-3 text-sm font-semibold tabular-nums" data-testid="text-balance-investments">{currency_format(data.toBalance.activeAndClosed)}</td>
                  <td className={`px-5 py-3 text-sm font-semibold tabular-nums ${data.toBalance.difference >= 0 ? "text-[#0ab39c]" : "text-[#f06548]"}`} data-testid="text-balance-difference">{currency_format(data.toBalance.difference)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

    </AdminLayout>
  );
}
