import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { exportInvestmentInvestors, fetchInvestmentInvestors, type InvestmentContributionStatus, type InvestmentInvestorsResponse, type InvestmentMatchInfo } from "../api/investment/investmentApi";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Download } from "lucide-react";
import { currency_format } from "@/helpers/format";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<InvestmentContributionStatus, string> = {
  "pending": "Pending",
  "in transit": "In Transit",
  "received": "Received",
};

const STATUS_BADGE_CLASS: Record<InvestmentContributionStatus, string> = {
  "pending": "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
  "in transit": "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200",
  "received": "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function MatchAnnotation({ match, idx }: { match: InvestmentMatchInfo | null; idx: number }) {
  if (!match) return null;
  if (match.asMatch) {
    const who = match.asMatch.triggeredName || "another investor";
    const triggeredAmt = match.asMatch.triggeredAmount;
    return (
      <div
        className="mt-1 inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-800"
        data-testid={`text-match-as-donor-${idx}`}
        title={`This is a match contribution from "${match.asMatch.grantName}"`}
      >
        <span className="font-medium">↪ Match for {who}{triggeredAmt != null ? ` (${currency_format(triggeredAmt)})` : ""}</span>
        <span className="text-violet-600">· {match.asMatch.grantName}</span>
      </div>
    );
  }
  if (match.triggeredMatches && match.triggeredMatches.length > 0) {
    const total = match.triggeredMatches.reduce((s, t) => s + (t.matchAmount || 0), 0);
    const grantNames = match.triggeredMatches.map(t => t.grantName).join(", ");
    return (
      <div
        className="mt-1 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
        data-testid={`text-match-triggered-${idx}`}
        title={match.triggeredMatches.map(t => `+${currency_format(t.matchAmount)} from "${t.grantName}"`).join("\n")}
      >
        <span className="font-medium">+ {currency_format(total)} matched</span>
        <span className="text-emerald-700">· {grantNames}</span>
      </div>
    );
  }
  return null;
}

export default function InvestmentInvestors() {
  const [, params] = useRoute("/investments/:id/investors");
  const [, setLocation] = useLocation();
  const investmentId = params ? parseInt(params.id, 10) : NaN;

  const [data, setData] = useState<InvestmentInvestorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    if (!data || data.items.length === 0) return;
    setExporting(true);
    try {
      await exportInvestmentInvestors(investmentId, data.campaignName || `investment_${investmentId}`);
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: err?.message || "Could not export investors.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (Number.isNaN(investmentId)) {
      setError("Invalid investment id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchInvestmentInvestors(investmentId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Failed to load investors"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [investmentId]);

  const totalAmount = data?.totalAmount || 0;
  const items = data?.items || [];

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/investments")}
            data-testid="button-back-to-investments"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Investments
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold" data-testid="text-investment-name">
                  {loading ? "Loading…" : data?.campaignName || `Investment #${investmentId}`}
                </h1>
                {data && (
                  <p className="text-sm text-muted-foreground" data-testid="text-investors-summary">
                    {data.totalInvestors.toLocaleString()} {data.totalInvestors === 1 ? "investor" : "investors"}
                    {" · "}
                    {data.totalContributions.toLocaleString()} {data.totalContributions === 1 ? "contribution" : "contributions"}
                    {" · "}
                    Total raised: <span className="font-medium">{currency_format(totalAmount)}</span>
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loading || exporting || !data || data.items.length === 0}
                data-testid="button-export-investors"
              >
                <Download className="h-4 w-4 mr-1" />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading investors…</div>
            ) : error ? (
              <div className="py-12 text-center text-sm text-destructive" data-testid="text-error">{error}</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No investors found for this investment.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-investors-detail">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount Invested</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const pct = totalAmount > 0 ? (it.totalAmount / totalAmount) * 100 : 0;
                      const rowKey = `${it.sourceType}-${it.sourceId}`;
                      return (
                        <tr
                          key={rowKey}
                          className="border-b last:border-b-0 hover:bg-muted/20"
                          data-testid={`row-investor-${idx}`}
                        >
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium align-top" data-testid={`text-investor-name-${idx}`}>
                            <div>{it.name}</div>
                            <MatchAnnotation match={it.match} idx={idx} />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground" data-testid={`text-investor-email-${idx}`}>
                            {it.email ? (
                              <a
                                href={`mailto:${it.email}`}
                                className="hover:underline text-[#405189]"
                              >
                                {it.email}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2" data-testid={`text-investor-status-${idx}`}>
                            <Badge variant="outline" className={STATUS_BADGE_CLASS[it.status]}>
                              {STATUS_LABEL[it.status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground tabular-nums" data-testid={`text-investor-date-${idx}`}>
                            {formatDate(it.date)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-investor-amount-${idx}`}>
                            {currency_format(it.totalAmount)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums" data-testid={`text-investor-pct-${idx}`}>
                            {pct.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-medium bg-muted/30">
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2" colSpan={4}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums" data-testid="text-investors-total-amount">
                        {currency_format(totalAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">100.00%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
