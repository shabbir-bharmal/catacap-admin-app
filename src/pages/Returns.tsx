import { useState, useEffect, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminLayout } from "../components/AdminLayout";
import { currency_format } from "@/helpers/format";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/helpers/format";
import { cn } from "@/lib/utils";
import { Download, ChevronLeft, ChevronRight, RefreshCw, CalendarIcon, Check, ChevronDown, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "../components/ui/pagination-controls";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchInvestmentNames, InvestmentNameOption } from "../api/completed-investment/completedInvestmentApi";
import {
  CalculateInvestmentReturnStatusResponse,
  calculateInvestmentReturn,
  createInvestmentReturn,
  exportInvestmentReturns,
  fetchInvestmentReturns,
  deleteInvestmentReturn,
  InvestmentReturnEntry,
  PaginatedInvestmentReturnResponse
} from "../api/investment-return/investmentReturnApi";

interface ReturnEntry {
  id: number;
  rowNumber: number;
  investmentName: string;
  dateRange: string;
  postDate: string;
  userFullName: string;
  email: string;
  investmentAmount: number;
  percentage: string;
  returnedAmount: number;
  memo: string;
  status: string;
}

interface CalculatedReturn {
  investmentName: string;
  firstName: string;
  lastName: string;
  email: string;
  investmentAmount: number;
  percentage: string;
  returnedAmount: number;
}

function mapToCalculatedReturn(item: InvestmentReturnEntry): CalculatedReturn {
  return {
    investmentName: item.investmentName,
    firstName: item.firstName || "",
    lastName: item.lastName || "",
    email: item.email || "",
    investmentAmount: item.investmentAmount || 0,
    percentage: `${Number(item.percentage || 0).toFixed(2)}%`,
    returnedAmount: item.returnedAmount || 0
  };
}

function isCalculateStatusResponse(response: unknown): response is CalculateInvestmentReturnStatusResponse {
  return !!response && typeof response === "object" && !Array.isArray(response) && "success" in response;
}

export default function AdminReturns() {
  const { user: authUser } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [data, setData] = useState<ReturnEntry[]>([]);
  const { toast } = useToast();

  const [selectedInvestment, setSelectedInvestment] = useState<InvestmentNameOption | null>(null);
  const [investmentPopoverOpen, setInvestmentPopoverOpen] = useState(false);
  const [filterReturnedAmount, setFilterReturnedAmount] = useState("");
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [calculatedReturns, setCalculatedReturns] = useState<CalculatedReturn[]>([]);
  const [showCalculated, setShowCalculated] = useState(false);
  const [adminMemo, setAdminMemo] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmittingReturns, setIsSubmittingReturns] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [calcCurrentPage, setCalcCurrentPage] = useState(1);
  const [calcRowsPerPage, setCalcRowsPerPage] = useState(100);
  const [disable, setDisable] = useState(false);
  const [memoError, setMemoError] = useState("");

  // Delete state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openDeleteDialog = (id: number) => {
    setDeleteTargetId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      const result = await deleteInvestmentReturn(deleteTargetId);
      if (result?.success !== true) {
        toast({
          title: "Delete Failed",
          description: result.message || "Failed to delete the investment return. Please try again.",
          variant: "destructive"
        });
        return;
      }
      setIsDeleteDialogOpen(false);
      setDeleteTargetId(null);
      setData(prev => prev.filter(r => r.id !== deleteTargetId));
      toast({
        title: "Investment Return Deleted",
        description: "The investment return has been deleted successfully."
      });
    } catch (error) {
      console.error("Failed to delete investment return", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete the investment return. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };
  const [errors, setErrors] = useState<{
    investment?: string;
    returnAmount?: string;
    startDate?: string;
    endDate?: string;
  }>({});

  const { data: investmentOptions = [], isLoading: isLoadingInvestmentOptions } = useQuery({
    queryKey: ["returnInvestmentNames", 4],
    queryFn: () => fetchInvestmentNames(4),
    staleTime: 0,
    gcTime: 0
  });

  const {
    data: returnsQueryData,
    isLoading: isReturnsLoading,
    refetch: refetchReturns
  } = useQuery<PaginatedInvestmentReturnResponse>({
    queryKey: ["investmentReturns", currentPage, rowsPerPage],
    queryFn: () =>
      fetchInvestmentReturns({
        currentPage,
        perPage: rowsPerPage
      }),
    staleTime: 0,
    gcTime: 0
  });

  useEffect(() => {
    if (!returnsQueryData) return;
    const mapped: ReturnEntry[] = (returnsQueryData.items || []).map((item, idx) => ({
      id: item.id,
      rowNumber: (currentPage - 1) * rowsPerPage + idx + 1,
      investmentName: item.investmentName,
      dateRange: item.privateDebtDates || "-",
      postDate: item.postDate || "-",
      userFullName: `${item.firstName || ""} ${item.lastName || ""}`.trim(),
      email: item.email,
      investmentAmount: item.investmentAmount,
      percentage: `${Number(item.percentage || 0).toFixed(2)}%`,
      returnedAmount: item.returnedAmount,
      memo: item.memo || "-",
      status: item.status || "-"
    }));
    setData(mapped);
  }, [returnsQueryData, currentPage, rowsPerPage]);

  function resetFilters() {
    setSelectedInvestment(null);
    setInvestmentPopoverOpen(false);
    setCurrentPage(1);
    setFilterReturnedAmount("");
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setShowCalculated(false);
    setCalculatedReturns([]);
    setAdminMemo("");
    setErrors({});
    setDisable(false);
    setMemoError("");
  }

  function validateFilters() {
    const newErrors: typeof errors = {};

    if (!selectedInvestment) {
      newErrors.investment = "Please select an investment.";
    }

    const returnedAmt = Number(filterReturnedAmount);
    if (!Number.isFinite(returnedAmt) || returnedAmt <= 0) {
      newErrors.returnAmount = "Enter a valid returned amount.";
    }

    if (!filterStartDate) {
      newErrors.startDate = "Start date is required.";
    }

    if (!filterEndDate) {
      newErrors.endDate = "End date is required.";
    }

    if (filterStartDate && filterEndDate && filterStartDate > filterEndDate) {
      newErrors.endDate = "End date must be after start date.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleCalculateClick() {
    if (!validateFilters()) return;
    setDisable(true);
    setConfirmDialogOpen(true);
  }

  async function handleConfirmYes() {
    setConfirmDialogOpen(false);

    if (!selectedInvestment?.id) {
      toast({
        title: "Investment required",
        description: "Please select an investment before calculating returns.",
        variant: "destructive"
      });
      return;
    }

    const returnedAmt = Number(filterReturnedAmount);
    if (!Number.isFinite(returnedAmt) || returnedAmt <= 0) {
      toast({
        title: "Invalid returned amount",
        description: "Enter a valid returned amount greater than 0.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsCalculating(true);
      const response = await calculateInvestmentReturn({
        investmentId: selectedInvestment.id,
        returnAmount: returnedAmt,
        memoNote: adminMemo,
        currentPage: calcCurrentPage,
        perPage: calcRowsPerPage,
        privateDebtStartDate: filterStartDate ? filterStartDate.toISOString() : null,
        privateDebtEndDate: filterEndDate ? filterEndDate.toISOString() : null
      });

      if (isCalculateStatusResponse(response) && response.success === false) {
        setShowCalculated(false);
        setCalculatedReturns([]);
        toast({
          title: "Calculation failed",
          description: response.message || "Failed to calculate returns.",
          variant: "destructive"
        });
        setDisable(false);
        return;
      }

      const items = Array.isArray(response) ? response : isCalculateStatusResponse(response) ? response.items || [] : response?.items || [];
      const calculated = items.map(mapToCalculatedReturn);

      setCalculatedReturns(calculated);
      setShowCalculated(calculated.length > 0);
      setAdminMemo("");
      setCalcCurrentPage(1);
      await refetchReturns();
    } catch (error) {
      console.error("Failed to calculate investment returns", error);
      toast({
        title: "Calculation failed",
        description: "Unable to calculate returns. Please try again.",
        variant: "destructive"
      });
      setDisable(false);
    } finally {
      setIsCalculating(false);
    }
  }

  function handleConfirmNo() {
    setConfirmDialogOpen(false);
    setDisable(false);
    setCalculatedReturns([]);
    setShowCalculated(false);
  }

  async function handleSubmitReturns() {
    if (!selectedInvestment?.id) {
      toast({
        title: "Investment required",
        description: "Please select an investment.",
        variant: "destructive"
      });
      return;
    }

    const returnedAmt = Number(filterReturnedAmount);
    if (!Number.isFinite(returnedAmt) || returnedAmt <= 0) {
      toast({
        title: "Invalid returned amount",
        description: "Enter a valid returned amount greater than 0.",
        variant: "destructive"
      });
      return;
    }

    if (!adminMemo.trim()) {
      setMemoError("Please enter a memo.");
      return;
    }

    setMemoError("");

    try {
      setIsSubmittingReturns(true);
      const response = await createInvestmentReturn({
        investmentId: selectedInvestment.id,
        returnAmount: returnedAmt,
        memoNote: adminMemo.trim(),
        privateDebtStartDate: filterStartDate ? filterStartDate.toISOString() : null,
        privateDebtEndDate: filterEndDate ? filterEndDate.toISOString() : null
      });

      if (response.success === false) {
        toast({
          title: "Submission failed",
          description: response.message || "Failed to submit returns.",
          variant: "destructive"
        });
        return;
      }

      resetFilters();
      toast({
        title: "Returns submitted",
        description: response.message || "Returns submitted successfully."
      });
      await refetchReturns();
    } catch (error) {
      console.error("Failed to submit investment returns", error);
      toast({
        title: "Submission failed",
        description: "Unable to submit returns. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingReturns(false);
    }
  }

  async function handleExport() {
    try {
      setIsExporting(true);
      await exportInvestmentReturns();
    } catch (error) {
      console.error("Failed to export investment returns", error);
    } finally {
      setIsExporting(false);
    }
  }

  const totalCount = returnsQueryData?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const paginatedData = data;
  const startIdx = totalCount > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx = Math.min(currentPage * rowsPerPage, totalCount);

  const calcTotalPages = Math.ceil(calculatedReturns.length / calcRowsPerPage);
  const calcPaginatedData = calculatedReturns.slice((calcCurrentPage - 1) * calcRowsPerPage, calcCurrentPage * calcRowsPerPage);
  const calcStartIdx = (calcCurrentPage - 1) * calcRowsPerPage + 1;
  const calcEndIdx = Math.min(calcCurrentPage * calcRowsPerPage, calculatedReturns.length);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
            Returns
          </h1>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-[440px]">
                <label className="text-xs text-muted-foreground mb-1 block">Investment Name</label>
                <Popover open={investmentPopoverOpen} onOpenChange={setInvestmentPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={investmentPopoverOpen}
                      className={cn(
                        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-normal",
                        !selectedInvestment && "text-muted-foreground",
                        errors.investment && "border-destructive text-destructive"
                      )}
                      data-testid="select-investment"
                      disabled={isLoadingInvestmentOptions}
                    >
                      <span className="truncate">{selectedInvestment ? selectedInvestment.name : "Select Investment"}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[440px] p-0" align="start">
                    <Command value={selectedInvestment?.name ?? ""}>
                      <CommandInput placeholder="Search investment..." />
                      <CommandList className="max-h-[264px]">
                        <CommandEmpty>No investment found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setSelectedInvestment(null);
                              setCurrentPage(1);
                              setInvestmentPopoverOpen(false);
                              setErrors((prev) => ({ ...prev, investment: undefined }));
                              setShowCalculated(false);
                              setCalculatedReturns([]);
                              setDisable(false);
                              setFilterReturnedAmount("");
                              setFilterStartDate(undefined);
                              setFilterEndDate(undefined);
                              setAdminMemo("");
                              setMemoError("");
                            }}
                          >
                            <Check className={`h-4 w-4 ${!selectedInvestment ? "opacity-100" : "opacity-0"}`} />
                            All Investments
                          </CommandItem>
                          {investmentOptions.map((opt) => (
                            <CommandItem
                              key={opt.id}
                              onSelect={() => {
                                setSelectedInvestment(opt);
                                setCurrentPage(1);
                                setInvestmentPopoverOpen(false);
                                setErrors((prev) => ({ ...prev, investment: undefined }));
                                setShowCalculated(false);
                                setCalculatedReturns([]);
                                setDisable(false);
                                setFilterReturnedAmount("");
                                setFilterStartDate(undefined);
                                setFilterEndDate(undefined);
                                setAdminMemo("");
                                setMemoError("");
                              }}
                            >
                              <Check className={`h-4 w-4 ${selectedInvestment?.id === opt.id ? "opacity-100" : "opacity-0"}`} />
                              {opt.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.investment && (
                  <p className="text-xs text-destructive mt-1" data-testid="error-investment">
                    {errors.investment}
                  </p>
                )}
              </div>
              <div className="w-[220px]">
                <label className="text-xs text-muted-foreground mb-1 block">Returned Amount</label>
                <Input
                  type="text"
                  placeholder="Returned Amount"
                  value={filterReturnedAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      setFilterReturnedAmount(value);
                      setErrors((prev) => ({ ...prev, returnAmount: undefined }));
                    }
                  }}
                  disabled={disable}
                  onKeyDown={(e) => {
                    if (["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
                    if ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) return;
                    if (!/[0-9.]/.test(e.key)) e.preventDefault();
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("Text");
                    if (!/^\d*\.?\d*$/.test(pasted)) e.preventDefault();
                  }}
                  inputMode="decimal"
                  maxLength={15}
                  className={cn("bg-background", errors.returnAmount && "border-destructive focus-visible:ring-destructive")}
                  data-testid="input-returned-amount"
                />
                {errors.returnAmount && (
                  <p className="text-xs text-destructive mt-1" data-testid="error-return-amount">
                    {errors.returnAmount}
                  </p>
                )}
              </div>
              <div className="w-[180px]">
                <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={disable}
                      className={cn(
                        "flex h-9 w-full items-center justify-start rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-normal",
                        !filterStartDate && "text-muted-foreground",
                        errors.startDate && "border-destructive"
                      )}
                      data-testid="input-start-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterStartDate ? formatDate(filterStartDate) : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filterStartDate}
                      onSelect={(date) => {
                        setFilterStartDate(date);
                        setErrors((prev) => ({ ...prev, startDate: undefined }));
                        setStartDateOpen(false);
                      }}
                      disabled={(date) => date > today}
                      initialFocus
                      data-testid="calendar-start-date"
                    />
                  </PopoverContent>
                </Popover>
                {errors.startDate && (
                  <p className="text-xs text-destructive mt-1" data-testid="error-start-date">
                    {errors.startDate}
                  </p>
                )}
              </div>
              <div className="w-[180px]">
                <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={disable}
                      className={cn(
                        "flex h-9 w-full items-center justify-start rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-normal",
                        !filterEndDate && "text-muted-foreground",
                        errors.endDate && "border-destructive"
                      )}
                      data-testid="input-end-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterEndDate ? formatDate(filterEndDate) : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filterEndDate}
                      onSelect={(date) => {
                        if (!date) {
                          setFilterEndDate(undefined);
                          setErrors((prev) => ({ ...prev, endDate: "End date is required." }));
                          setEndDateOpen(false);
                          return;
                        }
                        if (filterStartDate && date < filterStartDate) {
                          setFilterEndDate(date);
                          setErrors((prev) => ({ ...prev, endDate: "End date must be on or after start date." }));
                          setEndDateOpen(false);
                          return;
                        }
                        setFilterEndDate(date);
                        setErrors((prev) => ({ ...prev, endDate: undefined }));
                        setEndDateOpen(false);
                      }}
                      disabled={(date) => date > today}
                      initialFocus
                      data-testid="calendar-end-date"
                    />
                  </PopoverContent>
                </Popover>
                {errors.endDate && (
                  <p className="text-xs text-destructive mt-1" data-testid="error-end-date">
                    {errors.endDate}
                  </p>
                )}
              </div>
              <div className="flex flex-col">
                <label className="text-xs mb-1 block opacity-0 select-none">Action</label>
                <div className="flex items-center gap-2">
                  <Button className="bg-[#0ab39c] text-white" onClick={handleCalculateClick} disabled={isCalculating} data-testid="button-calculate">
                    {isCalculating ? "Calculating..." : "Calculate"}
                  </Button>
                  <Button size="icon" variant="outline" onClick={resetFilters} data-testid="button-refresh">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="ml-auto">
                <div className="flex flex-col">
                  <label className="text-xs mb-1 block opacity-0 select-none">Export</label>
                  <Button size="sm" className="bg-[#405189] text-white" onClick={handleExport} disabled={isExporting} data-testid="button-export-all">
                    <Download className="h-4 w-4 mr-1.5" />
                    {isExporting ? "Exporting..." : "Export All"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {showCalculated && calculatedReturns.length > 0 && (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-6 flex-wrap">
                    <span className="text-sm" data-testid="text-bulk-count">
                      Number of returns in this bulk transaction: <strong>{calculatedReturns.length}</strong>
                    </span>
                    <span className="text-sm" data-testid="text-bulk-investment">
                      Investment: <strong>{selectedInvestment?.name || "All Investments"}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium whitespace-nowrap">Admin memo:</label>
                      <div className="flex flex-col relative">
                        <Input
                          type="text"
                          placeholder="Enter memo"
                          value={adminMemo}
                          onChange={(e) => {
                            setAdminMemo(e.target.value);
                            setMemoError("");
                          }}
                          className="w-[180px]"
                          data-testid="input-admin-memo"
                        />
                        {memoError && (
                          <p className="text-xs text-destructive mt-1 absolute top-9" data-testid="error-memo">
                            {memoError}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button className="bg-[#0ab39c] text-white" onClick={handleSubmitReturns} disabled={isSubmittingReturns} data-testid="button-submit-returns">
                      {isSubmittingReturns ? "Submitting..." : "Submit Returns"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="px-5 py-3">
                  <h3 className="text-base font-semibold" data-testid="text-calculated-heading">
                    Calculated Returns
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="table-calculated-returns">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Investment Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">First Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Last Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Email</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Investment Amount</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Percentage</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Returned Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calcPaginatedData.map((item, idx) => (
                        <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors" data-testid={`row-calculated-${idx}`}>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-calc-investment-${idx}`}>
                              {item.investmentName}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-calc-first-name-${idx}`}>
                              {item.firstName}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-calc-last-name-${idx}`}>
                              {item.lastName}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm" data-testid={`text-calc-email-${idx}`}>
                              {item.email}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm tabular-nums" data-testid={`text-calc-investment-amount-${idx}`}>
                              {currency_format(item.investmentAmount)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm" data-testid={`text-calc-percentage-${idx}`}>
                              {item.percentage}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm tabular-nums" data-testid={`text-calc-returned-amount-${idx}`}>
                              {currency_format(item.returnedAmount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <PaginationControls
                  currentPage={calcCurrentPage}
                  totalCount={calculatedReturns.length}
                  rowsPerPage={calcRowsPerPage}
                  onPageChange={setCalcCurrentPage}
                  onRowsPerPageChange={(v) => {
                    setCalcRowsPerPage(v);
                    setCalcCurrentPage(1);
                  }}
                  dataTestId="pagination-calc-returns"
                />
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-returns">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Investment Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Date Range</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">PostDate</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">User Full Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Email</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Investment Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Percentage</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Returned Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Memo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Status</th>
                    {authUser?.isSuperAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isReturnsLoading ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Loading returns...
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No returns found.
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((item) => (
                      <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors" data-testid={`row-return-${item.id}`}>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-investment-${item.id}`}>
                            {item.investmentName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-date-range-${item.id}`}>
                            {item.dateRange}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-post-date-${item.id}`}>
                            {item.postDate}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-user-${item.id}`}>
                            {item.userFullName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-email-${item.id}`}>
                            {item.email}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm tabular-nums" data-testid={`text-investment-amount-${item.id}`}>
                            {currency_format(item.investmentAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm" data-testid={`text-percentage-${item.id}`}>
                            {item.percentage}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm tabular-nums" data-testid={`text-returned-amount-${item.id}`}>
                            {currency_format(item.returnedAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-memo-${item.id}`}>
                            {item.memo}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm" data-testid={`text-status-${item.id}`}>
                            {item.status}
                          </span>
                        </td>
                        {authUser?.isSuperAdmin && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end">
                              <div className="inline-flex rounded-md shadow-sm">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-8 w-8 text-[#f06548] hover:text-[#f06548] hover:bg-[#f06548]/5"
                                      onClick={() => openDeleteDialog(item.id)}
                                      data-testid={`button-delete-${item.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete return</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
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
              dataTestId="pagination-returns"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[480px]" data-testid="dialog-confirm-calculate">
          <div className="py-4">
            <p className="text-sm" data-testid="text-confirm-message">
              Returns are based on accepted recommendations. Are all recommendations for this Investment approved?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleConfirmNo} data-testid="button-confirm-no">
              NO
            </Button>
            <Button className="bg-[#0ab39c] text-white" onClick={handleConfirmYes} disabled={isCalculating} data-testid="button-confirm-yes">
              YES
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
        title="Delete Investment Return"
        description="Are you sure you want to delete this investment return? This action cannot be undone."
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
