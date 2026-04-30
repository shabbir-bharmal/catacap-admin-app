import { useState, useCallback, useEffect } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axiosInstance from "../api/axios";
import { currency_format, formatDate } from "../helpers/format";
import { Plus, Pencil, Trash2, GitMerge, Activity, ChevronDown, ChevronRight, Search, Loader2, Clock } from "lucide-react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounce } from "../hooks/useDebounce";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ //
// Types
// ------------------------------------------------------------------ //
interface Campaign { id: number; name: string; }
interface MatchGrant {
  id: number;
  name: string;
  donorUserId: string;
  donorEmail: string;
  donorFullName: string;
  donorBalance: number;
  totalCap: number | null;
  amountUsed: number;
  reservedAmount: number;
  matchType: "full" | "capped";
  perInvestmentCap: number | null;
  isActive: boolean;
  notes: string;
  expiresAt: string | null;
  createdAt: string;
  timesUsed: number;
  campaigns: Campaign[];
}
interface ActivityEntry {
  id: number;
  amount: number;
  createdAt: string;
  campaignName: string;
  investorFullName: string;
  investorEmail: string;
  triggeringRecommendationId: number | null;
  donorRecommendationId: number | null;
}
interface DonorOption { id: string; email: string; fullName: string; accountBalance: number; }

const EMPTY_FORM = {
  name: "",
  donorUserId: "",
  donorEmail: "",
  donorFullName: "",
  donorBalance: 0,
  reservedAmount: 0,
  amountUsed: 0,
  totalCap: "",
  matchType: "full" as "full" | "capped",
  perInvestmentCap: "",
  isActive: true,
  notes: "",
  expiresAt: "",
  campaignIds: [] as number[],
};

// ------------------------------------------------------------------ //
// API helpers
// ------------------------------------------------------------------ //
async function fetchMatchGrants(): Promise<MatchGrant[]> {
  const { data } = await axiosInstance.get("/api/admin/matching");
  return data.items || [];
}
async function fetchActivity(grantId: number): Promise<ActivityEntry[]> {
  const { data } = await axiosInstance.get(`/api/admin/matching/${grantId}/activity`);
  return data.items || [];
}
async function fetchCampaignOptions(): Promise<Campaign[]> {
  const { data } = await axiosInstance.get("/api/admin/investment/names?stage=11");
  return (data || []).map((c: any) => ({ id: Number(c.id), name: c.name }));
}
async function searchDonors(q: string): Promise<DonorOption[]> {
  if (q.length < 2) return [];
  const { data } = await axiosInstance.get(`/api/admin/matching/donor-search?q=${encodeURIComponent(q)}`);
  return data.items || [];
}

// ------------------------------------------------------------------ //
// Donor search combobox
// ------------------------------------------------------------------ //
function DonorSearch({
  value,
  displayName,
  onSelect,
}: {
  value: string;
  displayName: string;
  onSelect: (d: DonorOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQ = useDebounce(query, 350);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["donor-search", debouncedQ],
    queryFn: () => searchDonors(debouncedQ),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
          data-testid="button-donor-search"
        >
          {value ? (
            <span className="truncate">{displayName}</span>
          ) : (
            <span className="text-muted-foreground">Search by name or email…</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type name or email…"
            value={query}
            onValueChange={setQuery}
            data-testid="input-donor-query"
          />
          <CommandList>
            {isFetching && (
              <div className="py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}
            {!isFetching && results.length === 0 && debouncedQ.length >= 2 && (
              <CommandEmpty>No users found.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.id}
                  onSelect={() => {
                    onSelect(d);
                    setQuery("");
                    setOpen(false);
                  }}
                  data-testid={`option-donor-${d.id}`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{d.fullName || d.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.email} · Balance: {currency_format(d.accountBalance)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ //
// Campaign multi-select
// ------------------------------------------------------------------ //
function CampaignMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: Campaign[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = options.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectedNames = options
    .filter((c) => selected.includes(c.id))
    .map((c) => c.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal min-h-[40px] h-auto whitespace-normal text-left"
          data-testid="button-campaign-select"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Select campaigns…</span>
          ) : (
            <span className="line-clamp-2">{selectedNames.join(", ")}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Filter campaigns…"
            value={filter}
            onValueChange={setFilter}
          />
          <CommandList className="max-h-60">
            {filtered.length === 0 && <CommandEmpty>No campaigns found.</CommandEmpty>}
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={String(c.id)}
                  onSelect={() => toggle(c.id)}
                  data-testid={`option-campaign-${c.id}`}
                >
                  <div className={cn(
                    "mr-2 h-4 w-4 rounded border flex items-center justify-center text-xs",
                    selected.includes(c.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground",
                  )}>
                    {selected.includes(c.id) && "✓"}
                  </div>
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.length > 0 && (
          <div className="border-t p-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button size="sm" variant="ghost" onClick={() => onChange([])} className="text-xs h-6">
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ //
// Grant form dialog (create + edit)
// ------------------------------------------------------------------ //
function GrantFormDialog({
  open,
  onOpenChange,
  initial,
  campaigns,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: typeof EMPTY_FORM & { id?: number };
  campaigns: Campaign[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial.id;

  useEffect(() => { setForm(initial); }, [initial, open]);

  const upd = (key: keyof typeof EMPTY_FORM, val: any) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  // When editing, some of the old reservation can be returned → effective available = live balance + unused
  const unusedReservation = isEdit ? Math.max(0, form.reservedAmount - form.amountUsed) : 0;
  const effectiveAvailable = form.donorBalance + unusedReservation;

  const handleSave = async () => {
    if (!form.donorUserId) {
      toast({ title: "Error", description: "Please select a donor.", variant: "destructive" });
      return;
    }
    if (form.campaignIds.length === 0) {
      toast({ title: "Error", description: "Please select at least one campaign.", variant: "destructive" });
      return;
    }
    if (form.totalCap !== "" && form.donorUserId) {
      const cap = Number(form.totalCap);
      const limit = isEdit ? effectiveAvailable : form.donorBalance;
      if (cap > limit) {
        toast({
          title: "Cap exceeds available balance",
          description: `Total Grant Cap ($${cap.toLocaleString()}) cannot exceed ${currency_format(limit)}.`,
          variant: "destructive",
        });
        return;
      }
      if (isEdit && cap < form.amountUsed) {
        toast({
          title: "Cap too low",
          description: `Cap cannot be set below the amount already matched (${currency_format(form.amountUsed)}).`,
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        donorUserId: form.donorUserId,
        totalCap: form.totalCap !== "" ? Number(form.totalCap) : null,
        matchType: form.matchType,
        perInvestmentCap: form.matchType === "capped" && form.perInvestmentCap !== "" ? Number(form.perInvestmentCap) : null,
        isActive: form.isActive,
        notes: form.notes.trim(),
        expiresAt: form.expiresAt || null,
        campaignIds: form.campaignIds,
      };
      if (isEdit) {
        await axiosInstance.put(`/api/admin/matching/${initial.id}`, payload);
      } else {
        await axiosInstance.post("/api/admin/matching", payload);
      }
      toast({ title: "Saved", description: `Match grant ${isEdit ? "updated" : "created"} successfully.` });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Match Grant" : "New Match Grant"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Grant Label</Label>
            <Input
              value={form.name}
              onChange={(e) => upd("name", e.target.value)}
              placeholder="e.g. Lily – Empower Her Fund 2 Match"
              data-testid="input-grant-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Matching Donor *</Label>
            <DonorSearch
              value={form.donorUserId}
              displayName={form.donorFullName || form.donorEmail}
              onSelect={(d) => {
                upd("donorUserId", d.id);
                upd("donorEmail", d.email);
                upd("donorFullName", d.fullName);
                upd("donorBalance", d.accountBalance);
              }}
            />
            {form.donorUserId && (
              <p className="text-xs text-muted-foreground">
                {form.donorEmail} · Current balance: {currency_format(form.donorBalance)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Eligible Campaigns *</Label>
            <CampaignMultiSelect
              options={campaigns}
              selected={form.campaignIds}
              onChange={(ids) => upd("campaignIds", ids)}
            />
            <p className="text-xs text-muted-foreground">
              Investments into any selected campaign will trigger this match.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Total Grant Cap ($)</Label>
              <Input
                type="number"
                min="0"
                value={form.totalCap}
                onChange={(e) => upd("totalCap", e.target.value)}
                placeholder="Leave empty for unlimited"
                data-testid="input-total-cap"
                className={
                  form.totalCap !== "" && form.donorUserId && Number(form.totalCap) > (isEdit ? effectiveAvailable : form.donorBalance)
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {form.donorUserId && form.totalCap !== "" && Number(form.totalCap) > (isEdit ? effectiveAvailable : form.donorBalance) ? (
                <p className="text-xs text-destructive font-medium">
                  Exceeds available {currency_format(isEdit ? effectiveAvailable : form.donorBalance)}
                </p>
              ) : form.donorUserId ? (
                <p className="text-xs text-muted-foreground">
                  {isEdit && unusedReservation > 0
                    ? `Available: ${currency_format(effectiveAvailable)} (live balance + ${currency_format(unusedReservation)} unused reservation)`
                    : `Available: ${currency_format(form.donorBalance)}`
                  }
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Max total matched across all investments.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Match Type</Label>
              <Select value={form.matchType} onValueChange={(v) => upd("matchType", v)}>
                <SelectTrigger data-testid="select-match-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full match (1:1)</SelectItem>
                  <SelectItem value="capped">Up to a per-investment cap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.matchType === "capped" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Per-Investment Cap ($) *</Label>
              <Input
                type="number"
                min="0"
                value={form.perInvestmentCap}
                onChange={(e) => upd("perInvestmentCap", e.target.value)}
                placeholder="e.g. 5000"
                data-testid="input-per-cap"
              />
              <p className="text-xs text-muted-foreground">
                Max match per single investor investment.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Grant Expiry Date</Label>
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => upd("expiresAt", e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              data-testid="input-expires-at"
            />
            <p className="text-xs text-muted-foreground">
              Optional. On this date the grant is automatically deactivated and any unused reserved funds are returned to the donor.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => upd("notes", e.target.value)}
              placeholder="Internal notes (optional)"
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is-active"
              checked={form.isActive}
              onCheckedChange={(v) => upd("isActive", v)}
              data-testid="switch-is-active"
            />
            <Label htmlFor="is-active" className="text-sm cursor-pointer">Active</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-grant">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ //
// Activity panel (expandable per grant)
// ------------------------------------------------------------------ //
function ActivityPanel({ grantId }: { grantId: number }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["match-activity", grantId],
    queryFn: () => fetchActivity(grantId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No matching activity recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#405189] text-white">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Date</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Campaign</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Investor</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Matched</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, idx) => (
            <tr
              key={a.id}
              className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}
              data-testid={`row-activity-${a.id}`}
            >
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.createdAt)}</td>
              <td className="px-3 py-2">{a.campaignName}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{a.investorFullName || "—"}</div>
                <div className="text-xs text-muted-foreground">{a.investorEmail}</div>
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {currency_format(a.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Main page
// ------------------------------------------------------------------ //
export default function AdminMatching() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<(typeof EMPTY_FORM & { id?: number }) | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: grants = [], isLoading: grantsLoading } = useQuery({
    queryKey: ["/api/admin/matching"],
    queryFn: fetchMatchGrants,
    staleTime: 30_000,
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/admin/investment-list-for-matching"],
    queryFn: fetchCampaignOptions,
    staleTime: 120_000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/matching"] });
  }, [queryClient]);

  const openCreate = () => {
    setEditTarget({ ...EMPTY_FORM });
    setFormOpen(true);
  };

  const openEdit = (g: MatchGrant) => {
    setEditTarget({
      id: g.id,
      name: g.name,
      donorUserId: g.donorUserId,
      donorEmail: g.donorEmail,
      donorFullName: g.donorFullName,
      donorBalance: g.donorBalance,
      reservedAmount: g.reservedAmount,
      amountUsed: g.amountUsed,
      totalCap: g.totalCap != null ? String(g.totalCap) : "",
      matchType: g.matchType,
      perInvestmentCap: g.perInvestmentCap != null ? String(g.perInvestmentCap) : "",
      isActive: g.isActive,
      notes: g.notes,
      expiresAt: g.expiresAt ? g.expiresAt.slice(0, 10) : "",
      campaignIds: g.campaigns.map((c) => c.id),
    });
    setFormOpen(true);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await axiosInstance.delete(`/api/admin/matching/${id}`);
      toast({ title: "Deleted", description: "Match grant removed." });
      refresh();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Summary stats
  const totalActive = grants.filter((g) => g.isActive).length;
  const totalCommitted = grants.reduce((s, g) => s + (g.totalCap ?? 0), 0);
  const totalUsed = grants.reduce((s, g) => s + g.amountUsed, 0);
  const totalMatches = grants.reduce((s, g) => s + g.timesUsed, 0);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitMerge className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Investment Matching</h1>
              <p className="text-sm text-muted-foreground">
                Configure donors whose wallets are automatically drawn on whenever someone else invests in a selected campaign.
              </p>
            </div>
          </div>
          <Button onClick={openCreate} data-testid="button-new-grant">
            <Plus className="h-4 w-4 mr-2" /> New Match Grant
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Grants</p>
              <p className="text-2xl font-bold mt-1" data-testid="stat-active">{totalActive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Committed</p>
              <p className="text-2xl font-bold mt-1" data-testid="stat-committed">
                {totalCommitted > 0 ? currency_format(totalCommitted) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Matched</p>
              <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400" data-testid="stat-used">
                {currency_format(totalUsed)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Times Triggered</p>
              <p className="text-2xl font-bold mt-1" data-testid="stat-triggers">{totalMatches}</p>
            </CardContent>
          </Card>
        </div>

        {/* Grant list */}
        {grantsLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : grants.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <GitMerge className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No match grants yet</p>
              <p className="text-sm mt-1">Create one to start automatically matching investments.</p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> New Match Grant
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {grants.map((g) => {
              const pct = g.totalCap && g.totalCap > 0 ? Math.min(100, (g.amountUsed / g.totalCap) * 100) : null;
              const expanded = expandedIds.has(g.id);
              return (
                <Card key={g.id} className={cn(!g.isActive && "opacity-60")} data-testid={`card-grant-${g.id}`}>
                  <CardContent className="p-0">
                    {/* Row header */}
                    <div className="flex items-start gap-3 p-4">
                      <button
                        className="mt-1 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => toggleExpand(g.id)}
                        aria-label={expanded ? "Collapse activity" : "Expand activity"}
                        data-testid={`button-expand-${g.id}`}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-base">{g.name || `Grant #${g.id}`}</span>
                          <Badge variant={g.isActive ? "default" : "secondary"}>
                            {g.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">
                            {g.matchType === "full" ? "1:1 Full Match" : `Capped ${g.perInvestmentCap != null ? currency_format(g.perInvestmentCap) : ""}/investment`}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            <span className="font-medium text-foreground">Donor:</span>{" "}
                            {g.donorFullName || g.donorEmail}
                          </span>
                          <span>
                            <span className="font-medium text-foreground">Matched:</span>{" "}
                            {currency_format(g.amountUsed)}
                            {g.totalCap != null ? ` / ${currency_format(g.totalCap)}` : " (unlimited cap)"}
                          </span>
                          {g.reservedAmount > 0 && (
                            <span>
                              <span className="font-medium text-foreground">Escrowed:</span>{" "}
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                {currency_format(g.reservedAmount)}
                              </span>
                              {g.amountUsed > 0 && (
                                <span className="text-xs ml-1">
                                  ({currency_format(Math.max(0, g.reservedAmount - g.amountUsed))} remaining)
                                </span>
                              )}
                            </span>
                          )}
                          <span>
                            <span className="font-medium text-foreground">Times triggered:</span>{" "}
                            {g.timesUsed}
                          </span>
                          {g.expiresAt && (
                            <span className={cn(
                              "flex items-center gap-1",
                              new Date(g.expiresAt) < new Date() ? "text-destructive" : "",
                            )}>
                              <Clock className="h-3.5 w-3.5" />
                              <span className="font-medium text-foreground">Expires:</span>{" "}
                              {formatDate(g.expiresAt)}
                              {new Date(g.expiresAt) < new Date() && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">Expired</Badge>
                              )}
                            </span>
                          )}
                        </div>

                        {pct !== null && (
                          <div className="w-full max-w-xs">
                            <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
                              <span>Cap usage</span>
                              <span>{pct.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-green-500")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1">
                          {g.campaigns.map((c) => (
                            <Badge key={c.id} variant="outline" className="text-xs font-normal">
                              {c.name}
                            </Badge>
                          ))}
                          {g.campaigns.length === 0 && (
                            <span className="text-xs text-destructive">No campaigns selected</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(g)}
                          title="Edit"
                          data-testid={`button-edit-${g.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(g.id)}
                          disabled={deletingId === g.id}
                          title="Delete"
                          data-testid={`button-delete-${g.id}`}
                        >
                          {deletingId === g.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable activity log */}
                    {expanded && (
                      <div className="border-t bg-muted/20 px-4 pb-4">
                        <div className="flex items-center gap-2 py-3 text-sm font-medium text-muted-foreground">
                          <Activity className="h-4 w-4" />
                          Match Activity
                        </div>
                        <ActivityPanel grantId={g.id} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      {editTarget && (
        <GrantFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editTarget}
          campaigns={campaigns}
          onSaved={refresh}
        />
      )}
    </AdminLayout>
  );
}
