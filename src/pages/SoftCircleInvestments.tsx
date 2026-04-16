import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SortHeader } from "../components/ui/table-sort";
import { PaginationControls } from "../components/ui/pagination-controls";
import { useDebounce } from "../hooks/useDebounce";
import { formatLongDate } from "@/helpers/format";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Eye, ChevronLeft, ChevronRight, ArrowUpDown, FileText, Globe, Mail, Building2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchInvestmentRequests, fetchInvestmentRequestById, downloadInvestmentDocument, type InvestmentRequestItem } from "@/api/investment/investmentApi";
import { getUrlBlobContainerImage } from "@/lib/image-utils";

const STORAGE_KEY = "admin_fundraiser_applications";
const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  Submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "Under Review": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "On Hold": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Archived: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
};

const STATUSES = ["Draft", "Submitted", "Under Review", "Approved", "Rejected"];

export interface DonorCommitment {
  name: string;
  amount: string;
}

export type SoftCircleInvestment = InvestmentRequestItem & {
  website?: string;
  role?: string;
  currentlyRaising?: boolean;
  investmentTypes?: string[];
  investmentThemes?: string[];
  themeDescription?: string;
  capitalRaised?: string;
  referenceableInvestors?: string;
  hasDonorCommitment?: boolean;
  softCircledAmount?: number | null;
  donorCommitments?: DonorCommitment[];
  timeline?: string;
  goal?: number | null;
  referralSource?: string;
  logo?: string;
  heroImage?: string;
  pitchDeck?: string;
  investmentTerms?: string;
  whyBackYourInvestment?: string;
  notes?: string;
};

type SortField = "applicant" | "organization" | "status" | "createdat";
type SortDir = "asc" | "desc" | null;

function Field({ label, value }: { label: string; value?: string | number | boolean | string[] | null }) {
  if (value === null || value === undefined || value === "") return null;
  const display = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div>
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">{label}</Label>
      <p className="text-sm font-medium mt-0.5 break-words">{display}</p>
    </div>
  );
}

export default function SoftCircleInvestments() {
  const { toast } = useToast();
  const [, setNavigate] = useLocation(); // Keeping hook if needed for side effects, but actually unused now
  const [investments, setInvestments] = useState<SoftCircleInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const effectiveSearch = debouncedSearch.length >= 3 || debouncedSearch.length === 0 ? debouncedSearch : "";

  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (sortDir === "desc") {
        setSortDir(null);
        setSortField(null);
      } else {
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [viewApp, setViewApp] = useState<any | null>(null);

  const handleView = async (app: InvestmentRequestItem) => {
    try {
      const response = await fetchInvestmentRequestById(app.id);
      // Map properties for compatibility with the existing dialog structure
      // though we should probably just use the response keys directly
      const item = response.item;
      const mappedApp = {
        ...item,
        id: app.id,
        organization: item.organizationName,
        goal: item.campaignGoal,
        submitted: item.createdAt,
        pitchDeckFileName: item.pitchDeckFileName,
        logoFileName: item.logoFileName,
        heroImageFileName: item.heroImageFileName,
        investmentTypes: typeof item.investmentTypes === "string" ? item.investmentTypes.split(",") : item.investmentTypes,
        investmentThemes: typeof item.investmentThemes === "string" ? item.investmentThemes.split(",") : item.investmentThemes
      };
      setViewApp(mappedApp);
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch application details.", variant: "destructive" });
    }
  };

  const handleDownloadPdf = async (pdfFileName: string, originalPdfFileName: string) => {
    try {
      await downloadInvestmentDocument("download", pdfFileName, originalPdfFileName);
    } catch (err: any) {
      toast({ title: "Download Failed", description: err.message, variant: "destructive" });
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchInvestmentRequests({
        currentPage,
        perPage: rowsPerPage,
        searchValue: effectiveSearch,
        status: filterStatus && filterStatus !== "all" ? filterStatus : undefined,
        sortField: sortField && sortDir ? sortField : undefined,
        sortDirection: sortDir ? sortDir : undefined
      });
      setInvestments(data.items);
      setTotalCount(data.totalCount);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load investments.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentPage, effectiveSearch, filterStatus, sortField, sortDir, rowsPerPage]);

  const totalPages = Math.ceil(totalCount / rowsPerPage);


  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => handleSort(field)} className="flex items-center gap-1 font-semibold hover:text-primary transition-colors" data-testid={`sort-${field}`}>
      {label}
      <ArrowUpDown className={`w-3.5 h-3.5 ${sortField === field ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
            Soft Circle Investment
          </h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap border-b px-6 py-4">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or organization…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
                data-testid="input-search-applications"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <span>Filter by Status</span>
                <Select
                  value={filterStatus}
                  onValueChange={(v) => {
                    setFilterStatus(v);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-44" data-testid="select-filter-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUSES.map((s, idx) => (
                      <SelectItem key={s} value={String(idx)}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
            ) : investments.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No requests found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <SortHeader field="applicant" sortField={sortField} sortDir={sortDir as any} handleSort={handleSort}>
                        Applicant
                      </SortHeader>
                      <SortHeader field="organization" className="hidden md:table-cell" sortField={sortField} sortDir={sortDir as any} handleSort={handleSort}>
                        Organization
                      </SortHeader>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Country</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Goal</th>
                      <SortHeader field="createdat" className="hidden lg:table-cell" sortField={sortField} sortDir={sortDir as any} handleSort={handleSort}>
                        Submitted
                      </SortHeader>
                      <SortHeader field="status" sortField={sortField} sortDir={sortDir as any} handleSort={handleSort}>
                        Status
                      </SortHeader>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.map((app) => (
                      <tr key={app.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-investment-${app.id}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{app.fullName}</div>
                          <div className="text-xs text-muted-foreground">{app.email}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{app.organization || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{app.country || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{app.goal ? `$${app.goal.toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">{formatLongDate(app.submitted)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[app.statusName] ?? "bg-gray-100 text-gray-700"}`}>{app.statusName}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end">
                            <div className="inline-flex rounded-md shadow-sm">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 text-[#405189] hover:text-[#405189] hover:bg-[#405189]/5"
                                    onClick={() => handleView(app)}
                                    data-testid={`button-view-${app.id}`}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View details</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PaginationControls
              currentPage={currentPage}
              totalCount={totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(v) => {
                setRowsPerPage(v);
                setCurrentPage(1);
              }}
              dataTestId="pagination-soft-circle-investments"
            />
          </CardContent>
        </Card>
      </div>

      {/* View Dialog */}
      <Dialog
        open={viewApp !== null}
        onOpenChange={(open) => {
          if (!open) setViewApp(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-application">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-primary to-secondary p-2.5 rounded-lg">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <DialogTitle className="text-lg">View Application</DialogTitle>
            </div>
          </DialogHeader>

          {viewApp && (
            <div className="space-y-5 pt-1">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name" value={viewApp.firstName} />
                <Field label="Last Name" value={viewApp.lastName} />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <a href={`mailto:${viewApp.email}`} className="text-primary hover:underline">
                  {viewApp.email}
                </a>
              </div>
              {viewApp.website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <a href={viewApp.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {viewApp.website}
                  </a>
                </div>
              )}
              {viewApp.organization && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span>{viewApp.organization}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Country" value={viewApp.country} />
                <Field label="Role" value={viewApp.role} />
              </div>
              <div className="border-t border-border pt-4 grid grid-cols-2 gap-4">
                <Field label="Currently Raising" value={viewApp.currentlyRaising} />
                <Field label="Capital Raised" value={viewApp.capitalRaised} />
                <Field label="Campaign Goal" value={viewApp.goal ? `$${viewApp.goal.toLocaleString()}` : undefined} />
                <Field label="Timeline" value={viewApp.timeline} />
                <Field label="Soft-Circled Amount" value={viewApp.softCircledAmount ? `$${viewApp.softCircledAmount.toLocaleString()}` : undefined} />
                <Field label="Has Donor Commitment" value={viewApp.hasDonorCommitment} />
                <Field label="Referenceable Investors" value={viewApp.referenceableInvestors} />
                <Field label="Referral Source" value={viewApp.referralSource} />
              </div>
              {(viewApp.donorCommitments ?? []).length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Donor Commitments</Label>
                  <div className="mt-1.5 space-y-1">
                    {viewApp.donorCommitments!.map((dc: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{dc.name}</span>
                        {dc.amount && <span className="text-muted-foreground">— {dc.amount}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t border-border pt-4 space-y-4">
                {viewApp.logo && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Logo</Label>
                    <img
                      src={getUrlBlobContainerImage(viewApp.logo)}
                      alt="Organization logo"
                      className="mt-2 h-20 max-w-[200px] object-contain rounded border border-border bg-muted/30 p-1"
                      data-testid="img-view-logo"
                    />
                  </div>
                )}
                {viewApp.heroImage && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Hero Image</Label>
                    <img
                      src={getUrlBlobContainerImage(viewApp.heroImage)}
                      alt="Hero image"
                      className="mt-2 w-full max-h-64 object-contain rounded border border-border bg-muted/30"
                      data-testid="img-view-hero"
                    />
                  </div>
                )}
                {viewApp.pitchDeck && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Pitch Deck</Label>
                    <div className="flex items-center justify-between p-3 rounded border border-border bg-muted/30">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{viewApp.pitchDeckFileName || "Pitch Deck"}</span>
                      </div>
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => handleDownloadPdf(viewApp.pitchDeck || "", viewApp.pitchDeckFileName || "Pitch Deck.pdf")}>
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <Field label="Investment Types" value={viewApp.investmentTypes} />
                <Field label="Impact Themes" value={viewApp.investmentThemes} />
                <Field label="Theme Description" value={viewApp.themeDescription} />
                <Field label="Investment Terms" value={viewApp.investmentTerms} />
                {viewApp.whyBackYourInvestment && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Why Back This Investment</Label>
                    <div className="text-sm mt-1 prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: viewApp?.whyBackYourInvestment || "" }} />
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[viewApp?.statusName || ""] ?? ""}`}>{viewApp?.statusName}</span>
                  </div>
                </div>
                <Field label="Internal Notes" value={viewApp.notes} />
              </div>
              <div className="text-xs text-muted-foreground">Submitted: {formatLongDate(viewApp?.submitted)}</div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewApp(null)} data-testid="button-dialog-close">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
