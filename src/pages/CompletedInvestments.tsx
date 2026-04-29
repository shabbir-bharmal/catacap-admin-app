import { useState, useMemo, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "../components/AdminLayout";
import { currency_format, formatDate, formatDateISO } from "@/helpers/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil, FileText, RefreshCw, CalendarIcon, Trash2 } from "lucide-react";
import { useSort } from "../hooks/useSort";
import { SortHeader } from "../components/ui/table-sort";
import { PaginationControls } from "../components/ui/pagination-controls";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCompletedInvestments,
  exportCompletedInvestments,
  fetchCompletedInvestmentNotes,
  createCompletedInvestment,
  updateCompletedInvestmentNote,
  deleteCompletedInvestment,
  fetchCompletedInvestmentDetailsByInvestment,
  fetchTransactionTypes,
  fetchInvestmentTypes,
  fetchInvestmentNames,
  CompletedInvestmentEntry,
  CompletedInvestmentNoteEntry,
  InvestmentNameOption,
  InvestmentTypeOption,
  SiteConfigOption
} from "../api/completed-investment/completedInvestmentApi";

const CompletedInvestmentNotesRow = ({
  id,
  transactionTypeOptions,
  onEditNote
}: {
  id: number;
  transactionTypeOptions: SiteConfigOption[];
  onEditNote: (note: CompletedInvestmentNoteEntry) => void;
}) => {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["completedInvestmentNotes", id],
    queryFn: () => fetchCompletedInvestmentNotes(id),
    staleTime: 0,
    gcTime: 0
  });

  const resolveTransactionType = (tt: number | string) => {
    const opt = transactionTypeOptions.find((o) => o.id === tt || String(o.id) === String(tt) || o.value === tt);
    return opt?.value || "-";
  };

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Loading notes...</div>;
  }

  if (!notes || notes.length === 0) {
    return <div className="p-4 text-center text-sm text-muted-foreground">No notes found.</div>;
  }

  return (
    <div className="p-4 bg-muted/30">
      <div className="overflow-x-auto rounded-lg border shadow-sm bg-card">
        <table className="w-full" data-testid={`table-notes-${id}`}>
          <thead>
            <tr className="bg-[#405189]">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">Username</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">Transaction Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">Old Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">New Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">Note</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((entry, idx) => (
              <tr key={entry.id} className={`border-b last:border-0 ${idx % 2 === 0 ? "bg-card" : "bg-muted/30"}`} data-testid={`row-note-entry-${id}-${idx}`}>
                <td className="px-4 py-3 text-sm whitespace-nowrap" data-testid={`text-note-date-${id}-${idx}`}>
                  {formatDate(entry.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm" data-testid={`text-note-username-${id}-${idx}`}>
                  {entry.userName}
                </td>
                <td className="px-4 py-3 text-sm" data-testid={`text-note-transaction-${id}-${idx}`}>
                  {resolveTransactionType(entry.transactionType)}
                </td>
                <td className="px-4 py-3 text-sm" data-testid={`text-note-old-${id}-${idx}`}>
                  {entry.oldAmount !== null && entry.oldAmount !== undefined ? currency_format(entry.oldAmount) : "-"}
                </td>
                <td className="px-4 py-3 text-sm" data-testid={`text-note-new-${id}-${idx}`}>
                  {entry.newAmount !== null && entry.newAmount !== undefined ? currency_format(entry.newAmount) : "-"}
                </td>
                <td className="px-4 py-3 text-sm break-words min-w-[200px]" data-testid={`text-note-note-${id}-${idx}`}>
                  {entry.note}
                </td>
                <td className="px-4 py-3 text-center">
                  <Button size="icon" variant="ghost" className="text-[#0ab39c] h-8 w-8" onClick={() => onEditNote(entry)} data-testid={`button-edit-note-${id}-${idx}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


function MultiSelectTypesById({
  options,
  selected,
  onChange,
  placeholder,
  testId
}: {
  options: InvestmentTypeOption[];
  selected: number[];
  onChange: (v: number[]) => void;
  placeholder: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const displayText =
    selected.length > 0
      ? options
        .filter((o) => selected.includes(o.id))
        .map((o) => o.name)
        .join(", ")
      : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal text-left h-9 overflow-hidden" data-testid={testId}>
          <span className="truncate text-sm">{selected.length > 0 ? displayText : <span className="text-muted-foreground">{placeholder}</span>}</span>
          {open ? <ChevronUp className="h-4 w-4 shrink-0 ml-1 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 ml-1 text-muted-foreground" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="p-2 max-h-[280px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
          {options.map((opt) => {
            const checked = selected.includes(opt.id);
            return (
              <label
                key={opt.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 text-sm"
                data-testid={`option-${testId}-${opt.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v) {
                      onChange([...selected, opt.id]);
                    } else {
                      onChange(selected.filter((s) => s !== opt.id));
                    }
                  }}
                />
                {opt.name}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type SortField = "investmentname" | "fund" | "totalInvestmentAmount";

export default function AdminCompletedInvestments() {
  const { user: authUser } = useAuth();
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const { sortField, sortDir, handleSort: originalHandleSort } = useSort<SortField>();

  const handleSort = (field: SortField) => {
    originalHandleSort(field);
    setCurrentPage(1);
  };

  // --- Create form state ---
  const [selectedInvestment, setSelectedInvestment] = useState<InvestmentNameOption | null>(null);
  const [formDate, setFormDate] = useState<Date | undefined>(undefined);
  const [formDetails, setFormDetails] = useState("");
  const [formInvestmentTypeIds, setFormInvestmentTypeIds] = useState<number[]>([]);
  const [formCustomType, setFormCustomType] = useState("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formTransactionTypeId, setFormTransactionTypeId] = useState<string>("");
  const [formNote, setFormNote] = useState("");
  const [formBalanceSheet, setFormBalanceSheet] = useState("");
  const [pendingRecommendationsAmount, setPendingRecommendationsAmount] = useState(0);
  const [approvedRecommendationsAmount, setApprovedRecommendationsAmount] = useState(0);
  const [afterInvestmentChosen, setAfterInvestmentChosen] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // --- Create form validation ---
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // --- Confirmation dialog ---
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogText, setConfirmDialogText] = useState("");

  // --- Edit dialog state ---
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CompletedInvestmentEntry | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDetails, setEditDetails] = useState("");
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [editTypeIds, setEditTypeIds] = useState<number[]>([]);
  const [editCustomType, setEditCustomType] = useState("");
  const [editAmount, setEditAmount] = useState<number | "">("");
  const [editTransactionTypeId, setEditTransactionTypeId] = useState<string>("");
  const [editNote, setEditNote] = useState("");
  const [editBalanceSheet, setEditBalanceSheet] = useState("ImpactAssets");
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});

  // --- Note edit dialog state ---
  const [noteEditDialogOpen, setNoteEditDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [editingNoteTransactionTypeId, setEditingNoteTransactionTypeId] = useState<string>("");
  const [editingNoteNewAmount, setEditingNoteNewAmount] = useState<number | "">("");
  const [noteEditErrors, setNoteEditErrors] = useState<Record<string, string | undefined>>({});

  // --- General state ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);

  // --- Delete state ---
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const queryClient = useQueryClient();

  const openDeleteDialog = (id: number) => {
    setDeleteTargetId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await deleteCompletedInvestment(deleteTargetId);
      setIsDeleteDialogOpen(false);
      setDeleteTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["completedInvestments"] });
      toast({
        title: "Completed Investment Deleted",
        description: "The completed investment has been deleted successfully."
      });
    } catch (error) {
      console.error("Failed to delete completed investment", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete the completed investment. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Dropdown data ---
  const { data: investmentNamesData } = useQuery({
    queryKey: ["investmentNames"],
    queryFn: () => fetchInvestmentNames(10),
    staleTime: 0,
    gcTime: 0
  });

  const { data: investmentTypesData } = useQuery({
    queryKey: ["investmentTypes"],
    queryFn: fetchInvestmentTypes,
    staleTime: 0,
    gcTime: 0
  });

  const { data: transactionTypesData } = useQuery({
    queryKey: ["transactionTypes"],
    queryFn: () => fetchTransactionTypes("transaction-type"),
    staleTime: 0,
    gcTime: 0
  });

  const investmentOptions = useMemo(() => (investmentNamesData || []).map((opt) => ({ ...opt, name: opt.name?.trim() })), [investmentNamesData]);
  const investmentTypeOptions = investmentTypesData || [];
  const transactionTypeOptions = transactionTypesData || [];

  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  // --- Export ---
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportCompletedInvestments();
      toast({
        title: "The completed investments list has been exported.",
        duration: 4000
      });
    } catch (err: any) {
      toast({
        title: "Failed to export completed investments",
        variant: "destructive",
        duration: 4000
      });
    } finally {
      setIsExporting(false);
    }
  };

  // --- Investment selection: auto-populate fields ---
  const handleInvestmentChange = async (value: string) => {
    const inv = investmentOptions.find((o) => String(o.id) === value);
    if (!inv) {
      setSelectedInvestment(null);
      setAfterInvestmentChosen(false);
      return;
    }
    setSelectedInvestment(inv);
    setFormBalanceSheet("");
    setAfterInvestmentChosen(true);
    if (errors.investment) setErrors((prev) => ({ ...prev, investment: undefined }));

    setIsLoadingDetails(true);
    try {
      const details = await fetchCompletedInvestmentDetailsByInvestment(inv.id);
      if (details.dateOfLastInvestment) {
        const d = new Date(details.dateOfLastInvestment);
        setFormDate(isNaN(d.getTime()) ? undefined : d);
        setErrors((prev) => ({ ...prev, lastInvestment: undefined }));
      }
      if (details.typeOfInvestmentIds) {
        const ids = details.typeOfInvestmentIds
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n));
        setFormInvestmentTypeIds(ids);
        setErrors((prev) => ({ ...prev, investmentTypeValue: undefined }));
      }
      setPendingRecommendationsAmount(details.pendingRecommendationsAmount ?? 0);
      setApprovedRecommendationsAmount(details.approvedRecommendationsAmount ?? 0);
    } catch (err) {
      console.error("Error fetching completed investment details", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // --- Validation + Show confirmation dialog ---
  const handlePopup = () => {
    const errs: Record<string, string> = {};

    if (!selectedInvestment) errs.investment = "Please select an investment";
    if (!formDetails.trim()) errs.investmentDetail = "Please enter investment details";
    if (!formDate) errs.lastInvestment = "Please select the date of last investment";
    if (formInvestmentTypeIds.length === 0) errs.investmentTypeValue = "Please select at least one investment instrument";
    if (formInvestmentTypeIds.includes(-1) && !formCustomType.trim()) errs.typeOfInvestment = "Please specify the investment instrument";
    if (formAmount === "" || isNaN(Number(formAmount))) {
      errs.manualAmount = "Please enter a valid amount";
    } else if (Number(formAmount) <= 0) {
      errs.manualAmount = "Amount must be greater than 0";
    } else if (Number(formAmount) > approvedRecommendationsAmount) {
      errs.manualAmount = `Amount cannot be more than ${currency_format(approvedRecommendationsAmount)}`;
    }
    if (!formTransactionTypeId) errs.transactionType = "Please select a transaction type";
    if (!formNote.trim()) errs.note = "Please enter a note";
    if (!formBalanceSheet) errs.balanceSheet = "Please select a balance sheet";

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setConfirmDialogText(
      `You are completing this investment. It has ${currency_format(approvedRecommendationsAmount)} in approved recommendations and ${currency_format(pendingRecommendationsAmount)} in pending recommendations. Do you need to make any adjustments before you close this investment?`
    );
    setConfirmDialogOpen(true);
  };

  // --- Submit after confirmation ---
  const handleSubmitAfterConfirmation = async () => {
    setConfirmDialogOpen(false);
    if (!selectedInvestment) return;

    setIsSubmitting(true);
    try {
      await createCompletedInvestment({
        investmentId: selectedInvestment.id,
        investmentDetail: formDetails.trim(),
        totalInvestmentAmount: formAmount === "" ? undefined : Number(formAmount),
        transactionTypeId: Number(formTransactionTypeId),
        dateOfLastInvestment: formDate ? formatDateISO(formDate) : undefined,
        typeOfInvestmentIds: formInvestmentTypeIds.join(","),
        typeOfInvestmentName: formCustomType.trim() || undefined,
        note: formNote.trim(),
        balanceSheet: formBalanceSheet
      });
      toast({
        title: "Completed Investments saved successfully.",
        duration: 4000
      });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["completedInvestments"] });
      queryClient.invalidateQueries({ queryKey: ["investmentTypes"] });
    } catch {
      toast({
        title: "Failed to create completed investment.",
        variant: "destructive",
        duration: 4000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Edit dialog: update ---
  const handleUpdate = async () => {
    if (!editItem) return;

    const errs: Record<string, string> = {};
    if (!editDetails.trim()) errs.detail = "Please enter investment details";
    if (!editDate) errs.date = "Please select the date of last investment";
    if (editTypeIds.length === 0) errs.type = "Please select at least one investment instrument";
    if (editTypeIds.includes(-1) && !editCustomType.trim()) errs.customType = "Please specify the investment instrument";
    if (editAmount === "" || isNaN(Number(editAmount))) {
      errs.amount = "Please enter a valid amount";
    } else if (Number(editAmount) <= 0) {
      errs.amount = "Amount must be greater than 0";
    }
    if (!editTransactionTypeId) errs.changeType = "Please select a transaction type";
    if (!editBalanceSheet) errs.editVehicle = "Please select a balance sheet";

    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsUpdating(true);
    try {
      await createCompletedInvestment({
        id: editId!,
        investmentId: editItem.id,
        investmentDetail: editDetails.trim(),
        totalInvestmentAmount: Number(editAmount),
        transactionTypeId: Number(editTransactionTypeId),
        dateOfLastInvestment: editDate ? formatDateISO(editDate) : editItem.dateOfLastInvestment,
        typeOfInvestmentIds: editTypeIds.join(","),
        typeOfInvestmentName: editCustomType.trim(),
        note: editNote.trim(),
        balanceSheet: editBalanceSheet
      });
      toast({
        title: "Completed Investment updated successfully.",
        duration: 4000
      });
      setEditDialogOpen(false);
      setEditItem(null);
      queryClient.invalidateQueries({ queryKey: ["completedInvestments"] });
      queryClient.invalidateQueries({ queryKey: ["investmentTypes"] });
      if (expandedRow === editItem.id) {
        queryClient.invalidateQueries({ queryKey: ["completedInvestmentNotes", editItem.id] });
      }
    } catch {
      toast({
        title: "Failed to update completed investment.",
        variant: "destructive",
        duration: 4000
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // --- Note edit dialog: update ---
  const handleNoteUpdate = async () => {
    if (!selectedNote) return;

    const errs: Record<string, string> = {};
    if (!editingNoteValue.trim()) errs.note = "Please enter a note";
    if (!editingNoteTransactionTypeId) errs.transactionType = "Please select a transaction type";

    setNoteEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsUpdatingNote(true);
    try {
      const res = await updateCompletedInvestmentNote({
        completedInvestmentNoteId: selectedNote.id,
        transactionTypeId: Number(editingNoteTransactionTypeId),
        note: editingNoteValue.trim(),
        amount: editingNoteNewAmount === "" ? undefined : Number(editingNoteNewAmount)
      });
      toast({
        title: res.message || (res.success ? "Note updated successfully." : "Failed to update note."),
        variant: res.success ? undefined : "destructive",
        duration: 4000
      });
      if (res.success) {
        setNoteEditDialogOpen(false);
        if (expandedRow) {
          queryClient.invalidateQueries({ queryKey: ["completedInvestmentNotes", expandedRow] });
        }
      }
    } catch {
      toast({
        title: "Failed to update note.",
        variant: "destructive",
        duration: 4000
      });
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const openNoteEditDialog = (note: CompletedInvestmentNoteEntry) => {
    setSelectedNote(note);
    setEditingNoteValue(note.note || "");
    const matchedOption = transactionTypeOptions.find((o) => o.id === note.transactionType || String(o.id) === String(note.transactionType) || o.value === note.transactionType);
    setEditingNoteTransactionTypeId(matchedOption ? String(matchedOption.id) : "");
    setEditingNoteNewAmount(note.newAmount ?? "");
    setNoteEditErrors({});
    setNoteEditDialogOpen(true);
  };

  function resetForm() {
    setSelectedInvestment(null);
    setFormDate(undefined);
    setFormDetails("");
    setFormInvestmentTypeIds([]);
    setFormCustomType("");
    setFormAmount("");
    setFormTransactionTypeId("");
    setFormNote("");
    setFormBalanceSheet("");
    setErrors({});
    setAfterInvestmentChosen(false);
    setPendingRecommendationsAmount(0);
    setApprovedRecommendationsAmount(0);
  }

  function openEditDialog(item: CompletedInvestmentEntry) {
    setEditItem(item);
    setEditId((item as any).id);
    setEditDetails(item.investmentDetail ?? "");
    try {
      const d = new Date(item.dateOfLastInvestment);
      setEditDate(isNaN(d.getTime()) ? undefined : d);
    } catch {
      setEditDate(undefined);
    }
    setEditAmount(item.totalInvestmentAmount !== null && item.totalInvestmentAmount !== undefined ? Number(item.totalInvestmentAmount) : 0);
    setEditNote("");

    if (item.balanceSheet) {
      const bs = item.balanceSheet.trim();
      if (bs === "ImpactAssets" || bs === "Impact Assets") {
        setEditBalanceSheet("ImpactAssets");
      } else if (bs === "CataCap") {
        setEditBalanceSheet("CataCap");
      } else {
        setEditBalanceSheet("");
      }
    } else {
      setEditBalanceSheet("");
    }

    // Resolve type IDs
    if ((item as any).typeOfInvestmentIds) {
      const ids = String((item as any).typeOfInvestmentIds)
        .split(",")
        .map((s: string) => Number(s.trim()))
        .filter((n: number) => !isNaN(n));
      setEditTypeIds(ids);
    } else if (item.typeOfInvestment) {
      const names = item.typeOfInvestment.split(",").map((s) => s.trim().toLowerCase());
      const ids = investmentTypeOptions.filter((t) => names.includes(t.name.toLowerCase())).map((t) => t.id);
      setEditTypeIds(ids);
    } else {
      setEditTypeIds([]);
    }
    setEditCustomType("");

    const changeTypeId = (item as any).transactionTypeId ?? item.transactionType ?? "";
    setEditTransactionTypeId(changeTypeId ? String(changeTypeId) : "");

    setEditErrors({});
    setEditDialogOpen(true);
  }

  const { data: queryData, isLoading } = useQuery({
    queryKey: ["completedInvestments", currentPage, rowsPerPage, sortField, sortDir],
    queryFn: () =>
      fetchCompletedInvestments({
        currentPage,
        perPage: rowsPerPage,
        sortField: sortField || undefined,
        sortDirection: sortDir || undefined
      }),
    staleTime: 0,
    gcTime: 0
  });

  const paginatedData = queryData?.items || [];
  const totalCount = queryData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const startIdx = totalCount > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx = Math.min(currentPage * rowsPerPage, totalCount);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
            Completed Investments
          </h1>
          <Button size="sm" className="bg-[#405189] text-white" data-testid="button-export-all" onClick={handleExport} disabled={isExporting}>
            <Download className="h-4 w-4 mr-1.5" />
            {isExporting ? "Exporting..." : "Export All"}
          </Button>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex gap-4">
              {/* Col 1: Form fields */}
              <div className="flex-1 space-y-3">
                {/* Row 1: Select Investment | Pick a date | Investment Details */}
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="w-[200px]">
                    <Select value={selectedInvestment ? String(selectedInvestment.id) : ""} onValueChange={handleInvestmentChange}>
                      <SelectTrigger className="text-left" data-testid="select-investment">
                        <SelectValue placeholder="Select Investment" />
                      </SelectTrigger>
                      <SelectContent>
                        {investmentOptions.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.investment && <p className="text-xs text-red-500 mt-0.5">{errors.investment}</p>}
                  </div>
                  <div className="w-[180px]">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")} data-testid="input-date">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formDate ? formatDate(formDate) : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={formDate}
                          onSelect={(d) => {
                            setFormDate(d);
                            if (d) setErrors((prev) => ({ ...prev, lastInvestment: undefined }));
                          }}
                          initialFocus
                          data-testid="calendar-form-date"
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.lastInvestment && <p className="text-xs text-red-500 mt-0.5">{errors.lastInvestment}</p>}
                  </div>
                  <div className="w-[180px]">
                    <Select value={formBalanceSheet} onValueChange={(v) => {
                      setFormBalanceSheet(v);
                      if (errors.balanceSheet) setErrors(prev => ({ ...prev, balanceSheet: undefined }));
                    }}>
                      <SelectTrigger className={cn("text-left", errors.balanceSheet && "border-red-500")} data-testid="select-vehicle">
                        <SelectValue placeholder="Select Balance Sheet" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ImpactAssets">Impact Assets</SelectItem>
                        <SelectItem value="CataCap">CataCap</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.balanceSheet && <p className="text-xs text-red-500 mt-0.5">{errors.balanceSheet}</p>}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Textarea
                      placeholder="Enter the Completed Investment Details"
                      value={formDetails}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, 1000);
                        setFormDetails(v);
                        if (errors.investmentDetail && v.trim()) setErrors((prev) => ({ ...prev, investmentDetail: undefined }));
                      }}
                      maxLength={1000}
                      className="resize-none min-h-[38px]"
                      rows={1}
                      data-testid="input-details"
                    />
                    <div className="flex justify-between mt-0.5">
                      {errors.investmentDetail ? <p className="text-xs text-red-500">{errors.investmentDetail}</p> : <span />}
                      <p className="text-xs text-muted-foreground">{formDetails.length}/1000</p>
                    </div>
                  </div>
                </div>
                {/* Row 2: Investment Instruments | Amount | Transaction Type | Note */}
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="w-[240px]">
                    <MultiSelectTypesById
                      options={investmentTypeOptions}
                      selected={formInvestmentTypeIds}
                      onChange={(v) => {
                        setFormInvestmentTypeIds(v);
                        if (v.length > 0) setErrors((prev) => ({ ...prev, investmentTypeValue: undefined }));
                      }}
                      placeholder="Select Investment Instruments"
                      testId="select-investment-type"
                    />
                    {errors.investmentTypeValue && <p className="text-xs text-red-500 mt-0.5">{errors.investmentTypeValue}</p>}
                  </div>
                  {formInvestmentTypeIds.includes(-1) && (
                    <div className="w-[200px]">
                      <Input
                        placeholder="Enter Investment Instrument"
                        value={formCustomType}
                        onChange={(e) => {
                          setFormCustomType(e.target.value);
                          if (errors.typeOfInvestment && e.target.value.trim()) setErrors((prev) => ({ ...prev, typeOfInvestment: undefined }));
                        }}
                        data-testid="input-custom-type"
                      />
                      {errors.typeOfInvestment && <p className="text-xs text-red-500 mt-0.5">{errors.typeOfInvestment}</p>}
                    </div>
                  )}
                  <div className="w-[140px]">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={formAmount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormAmount(v === "" ? "" : Number(v));
                        if (errors.manualAmount) setErrors((prev) => ({ ...prev, manualAmount: undefined }));
                      }}
                      data-testid="input-amount"
                    />
                    {errors.manualAmount && <p className="text-xs text-red-500 mt-0.5">{errors.manualAmount}</p>}
                  </div>
                  <div className="w-[200px]">
                    <Select
                      value={formTransactionTypeId}
                      onValueChange={(v) => {
                        setFormTransactionTypeId(v);
                        if (errors.transactionType) setErrors((prev) => ({ ...prev, transactionType: undefined }));
                      }}
                    >
                      <SelectTrigger className="text-left" data-testid="select-transaction-type">
                        <SelectValue placeholder="Select Transaction Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {transactionTypeOptions.map((opt) => (
                          <SelectItem key={opt.id} value={String(opt.id)}>
                            {opt.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.transactionType && <p className="text-xs text-red-500 mt-0.5">{errors.transactionType}</p>}
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <Textarea
                      placeholder="Note"
                      value={formNote}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, 1000);
                        setFormNote(v);
                        if (errors.note && v.trim()) setErrors((prev) => ({ ...prev, note: undefined }));
                      }}
                      maxLength={1000}
                      className="resize-none min-h-[38px]"
                      rows={1}
                      data-testid="input-note"
                    />
                    <div className="flex justify-between mt-0.5">
                      {errors.note ? <p className="text-xs text-red-500">{errors.note}</p> : <span />}
                      <p className="text-xs text-muted-foreground">{formNote.length}/1000</p>
                    </div>
                  </div>
                </div>
                {afterInvestmentChosen && !isLoadingDetails && approvedRecommendationsAmount === 0 && <p className="text-xs text-red-500">This investment has 0 approved amount.</p>}
              </div>
              {/* Col 2: Submit + Reset buttons */}
              <div className="flex items-end gap-2 pt-0.5 mb-4">
                <Button
                  className="bg-[#0ab39c] text-white"
                  data-testid="button-submit"
                  onClick={handlePopup}
                  disabled={isSubmitting || isLoadingDetails || (afterInvestmentChosen && approvedRecommendationsAmount === 0)}
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </Button>
                <Button size="icon" variant="outline" onClick={resetForm} data-testid="button-refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-completed-investments">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      Date of Last
                      <br />
                      Investment
                    </th>
                    <SortHeader field="investmentname" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      CataCap Investment
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Stage</th>
                    <SortHeader field="fund" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      CataCap Fund
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      Investment
                      <br />
                      Detail
                    </th>
                    <SortHeader field="totalInvestmentAmount" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      Amount
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Investment Instruments</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Balance Sheet</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Donors</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Theme(s)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Loading completed investments...
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No completed investments found.
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((item) => (
                      <Fragment key={item.id}>
                        <tr className="border-b last:border-b-0 hover:bg-muted/20 transition-colors" data-testid={`row-investment-${item.id}`}>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-date-${item.id}`}>
                              {formatDate(item.dateOfLastInvestment)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-investment-${item.id}`}>
                              {item.name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-stage-${item.id}`}>
                              {item.stage}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-fund-${item.id}`}>
                              {item.cataCapFund || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-detail-${item.id}`}>
                              {item.investmentDetail}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-amount-${item.id}`}>
                              {currency_format(item.totalInvestmentAmount)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-muted-foreground max-w-[200px] block" data-testid={`text-type-${item.id}`}>
                              {item.typeOfInvestment}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-vehicle-${item.id}`}>
                              {item.balanceSheet || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-donors-${item.id}`}>
                              {item.donors}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-muted-foreground max-w-[220px] block" data-testid={`text-themes-${item.id}`}>
                              {item.themes}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end">
                              <div className="inline-flex rounded-md shadow-sm">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className={cn(
                                          "h-8 w-8 rounded-r-none border-r-0 text-[#64748b] hover:text-[#405189] hover:bg-[#405189]/5",
                                          expandedRow === item.id ? "text-[#405189] bg-[#405189]/5" : ""
                                        )}
                                        onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                                        data-testid={`button-notes-${item.id}`}
                                      >
                                        <FileText className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{expandedRow === item.id ? "Hide Notes" : "Show Notes"}</TooltipContent>
                                  </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className={cn(
                                        "h-8 w-8 rounded-l-none text-[#0ab39c] hover:text-[#0ab39c] hover:bg-[#0ab39c]/5",
                                        authUser?.isSuperAdmin ? "border-r-0 rounded-r-none" : ""
                                      )}
                                      onClick={() => openEditDialog(item)}
                                      data-testid={`button-update-${item.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Update investment</TooltipContent>
                                </Tooltip>
                                {authUser?.isSuperAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8 rounded-l-none text-[#f06548] hover:text-[#f06548] hover:bg-[#f06548]/5"
                                        onClick={() => openDeleteDialog(item.id)}
                                        data-testid={`button-delete-${item.id}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete investment</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                        {expandedRow === item.id && (
                          <tr className="border-b" data-testid={`row-notes-${item.id}`}>
                            <td colSpan={11} className="p-0">
                              <CompletedInvestmentNotesRow id={item.id} transactionTypeOptions={transactionTypeOptions} onEditNote={openNoteEditDialog} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationControls
              currentPage={currentPage}
              totalCount={totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(v) => {
                setRowsPerPage(v);
                setCurrentPage(1);
              }}
              dataTestId="pagination-completed-investments"
            />
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[480px]" data-testid="dialog-confirm-submit">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold leading-relaxed">{confirmDialogText}</DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialogOpen(false);
                setLocation("/recommendations");
              }}
              data-testid="button-confirm-adjust"
            >
              Adjust Recommendations
            </Button>
            <Button className="bg-[#405189] text-white" onClick={handleSubmitAfterConfirmation} data-testid="button-confirm-proceed">
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Investment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[520px]" data-testid="dialog-update-investment">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold" data-testid="text-dialog-title">
              Update Completed Investment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  placeholder="Investment Detail"
                  value={editDetails}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, 1000);
                    setEditDetails(v);
                    if (editErrors.detail) setEditErrors((prev) => ({ ...prev, detail: undefined }));
                  }}
                  maxLength={1000}
                  data-testid="input-edit-details"
                />
                <p className="text-xs text-muted-foreground text-right mt-0.5">{editDetails.length}/1000</p>
                {editErrors.detail && <p className="text-xs text-red-500 mt-0.5">{editErrors.detail}</p>}
              </div>
              <div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editDate && "text-muted-foreground")} data-testid="input-edit-date">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editDate ? formatDate(editDate) : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editDate}
                      onSelect={(d) => {
                        setEditDate(d);
                        if (d && editErrors.date) setEditErrors((prev) => ({ ...prev, date: undefined }));
                      }}
                      initialFocus
                      data-testid="calendar-edit-date"
                    />
                  </PopoverContent>
                </Popover>
                {editErrors.date && <p className="text-xs text-red-500 mt-0.5">{editErrors.date}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <MultiSelectTypesById
                  options={investmentTypeOptions}
                  selected={editTypeIds}
                  onChange={(v) => {
                    setEditTypeIds(v);
                    if (editErrors.type) setEditErrors((prev) => ({ ...prev, type: undefined }));
                  }}
                  placeholder="Select Investment Instruments"
                  testId="select-edit-investment-type"
                />
                {editErrors.type && <p className="text-xs text-red-500 mt-0.5">{editErrors.type}</p>}
                {editTypeIds.includes(-1) && (
                  <div className="mt-2">
                    <Input
                      placeholder="Enter Investment Instrument"
                      value={editCustomType}
                      onChange={(e) => {
                        setEditCustomType(e.target.value);
                        if (editErrors.customType && e.target.value.trim()) setEditErrors((prev) => ({ ...prev, customType: undefined }));
                      }}
                      data-testid="input-edit-custom-type"
                    />
                    {editErrors.customType && <p className="text-xs text-red-500 mt-0.5">{editErrors.customType}</p>}
                  </div>
                )}
              </div>
              <div>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditAmount(v === "" ? "" : Number(v));
                    if (editErrors.amount) setEditErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                  placeholder="Amount"
                  data-testid="input-edit-amount"
                />
                {editErrors.amount && <p className="text-xs text-red-500 mt-0.5">{editErrors.amount}</p>}
              </div>
            </div>
            <div>
              <Select
                value={editTransactionTypeId}
                onValueChange={(v) => {
                  setEditTransactionTypeId(v);
                  if (editErrors.changeType) setEditErrors((prev) => ({ ...prev, changeType: undefined }));
                }}
              >
                <SelectTrigger data-testid="select-edit-transaction-type">
                  <SelectValue placeholder="Select Transaction Type" />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={String(opt.id)}>
                      {opt.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editErrors.changeType && <p className="text-xs text-red-500 mt-0.5">{editErrors.changeType}</p>}
            </div>

            <div className="space-y-2">
              <Select value={editBalanceSheet} onValueChange={(v) => {
                setEditBalanceSheet(v);
                if (editErrors.editVehicle) setEditErrors(prev => ({ ...prev, editVehicle: undefined }));
              }}>
                <SelectTrigger className={cn(editErrors.editVehicle && "border-red-500")} data-testid="edit-select-vehicle">
                  <SelectValue placeholder="Select Balance Sheet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ImpactAssets">Impact Assets</SelectItem>
                  <SelectItem value="CataCap">CataCap</SelectItem>
                </SelectContent>
              </Select>
              {editErrors.editVehicle && <p className="text-xs text-red-500 mt-0.5">{editErrors.editVehicle}</p>}
            </div>

            <div>
              <Textarea
                placeholder="Note"
                value={editNote}
                onChange={(e) => {
                  const v = e.target.value.slice(0, 1000);
                  setEditNote(v);
                  if (editErrors.note && v.trim()) setEditErrors((prev) => ({ ...prev, note: undefined }));
                }}
                maxLength={1000}
                className="resize-y"
                rows={3}
                data-testid="input-edit-note"
              />
              <p className="text-xs text-muted-foreground text-right mt-0.5">{editNote.length}/1000</p>
              {editErrors.note && <p className="text-xs text-red-500 mt-0.5">{editErrors.note}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-edit-cancel">
              CANCEL
            </Button>
            <Button className="bg-[#405189] text-white" onClick={handleUpdate} disabled={isUpdating} data-testid="button-edit-update">
              {isUpdating ? "UPDATING..." : "UPDATE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note Edit Dialog */}
      <Dialog open={noteEditDialogOpen} onOpenChange={setNoteEditDialogOpen}>
        <DialogContent className="sm:max-w-[480px]" data-testid="dialog-update-note">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Update Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Select
                value={editingNoteTransactionTypeId}
                onValueChange={(v) => {
                  setEditingNoteTransactionTypeId(v);
                  if (noteEditErrors.transactionType) setNoteEditErrors((prev) => ({ ...prev, transactionType: undefined }));
                }}
              >
                <SelectTrigger data-testid="select-note-transaction-type">
                  <SelectValue placeholder="Select Transaction Type" />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={String(opt.id)}>
                      {opt.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noteEditErrors.transactionType && <p className="text-xs text-red-500 mt-0.5">{noteEditErrors.transactionType}</p>}
            </div>
            <Input
              type="number"
              placeholder="New Amount"
              value={editingNoteNewAmount}
              onChange={(e) => {
                const v = e.target.value;
                setEditingNoteNewAmount(v === "" ? "" : Number(v));
              }}
              data-testid="input-note-new-amount"
            />
            <div>
              <Textarea
                placeholder="Note"
                value={editingNoteValue}
                onChange={(e) => {
                  const v = e.target.value.slice(0, 1000);
                  setEditingNoteValue(v);
                  if (noteEditErrors.note && v.trim()) setNoteEditErrors((prev) => ({ ...prev, note: undefined }));
                }}
                maxLength={1000}
                className="resize-y"
                rows={3}
                data-testid="input-note-edit-value"
              />
              <p className="text-xs text-muted-foreground text-right mt-0.5">{editingNoteValue.length}/1000</p>
              {noteEditErrors.note && <p className="text-xs text-red-500 mt-0.5">{noteEditErrors.note}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNoteEditDialogOpen(false)} data-testid="button-note-cancel">
              Cancel
            </Button>
            <Button className="bg-[#405189] text-white" onClick={handleNoteUpdate} disabled={isUpdatingNote} data-testid="button-note-update">
              {isUpdatingNote ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) setDeleteTargetId(null);
        }}
        title="Delete Completed Investment"
        description="Are you sure you want to delete this completed investment? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        isSubmitting={isDeleting}
        confirmButtonClass="bg-[#f06548] text-white hover:bg-[#d0543c]"
        dataTestId="dialog-delete"
      />
    </AdminLayout>
  );
}
