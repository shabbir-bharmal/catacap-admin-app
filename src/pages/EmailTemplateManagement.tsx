import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Search,
  Plus,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Eye,
  Copy,
  Code,
  Mail,
  Bold,
  Italic,
  Underline,
  Link,
  ListOrdered,
  List,
  RemoveFormatting,
  Image as ImageIcon,
  Loader2,
  Check,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "../components/ui/pagination-controls";
import {
  fetchEmailTemplates,
  fetchEmailTemplateById,
  fetchEmailTemplateCategories,
  fetchEmailTemplateDuplicate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  sendTestEmail,
  EmailTemplateListItem,
  EmailTemplateCategory
} from "../api/email-template/emailTemplateApi";
import { useSort } from "../hooks/useSort";
import { useDebounce } from "../hooks/useDebounce";
import { SortHeader } from "../components/ui/table-sort";
import { useAuth } from "@/contexts/AuthContext";

const statusBadge = (statusName: string) => {
  if (statusName === "Active") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">{statusName}</Badge>;
  if (statusName === "Draft") return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">{statusName}</Badge>;
  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0">{statusName}</Badge>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmailTemplateManagement() {
  const { toast } = useToast();
  const { hasActionPermission } = useAuth();
  const queryClient = useQueryClient();

  // ── List / filter state ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const effectiveSearch = debouncedSearch.length >= 3 || debouncedSearch.length === 0 ? debouncedSearch : "";

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  const { sortField, sortDir, handleSort: originalHandleSort } = useSort<string>();

  const handleSort = (field: string) => {
    originalHandleSort(field);
    setCurrentPage(1);
  };

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: listData, isLoading: isLoadingList } = useQuery({
    queryKey: ["email-templates", currentPage, rowsPerPage, effectiveSearch, categoryFilter, statusFilter, sortField, sortDir],
    queryFn: () =>
      fetchEmailTemplates({
        currentPage,
        perPage: rowsPerPage,
        searchValue: effectiveSearch || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        sortField: sortField || undefined,
        sortDirection: sortDir || undefined
      }),
    staleTime: 0,
    gcTime: 0
  });

  const { data: categories = [] } = useQuery<EmailTemplateCategory[]>({
    queryKey: ["email-template-categories"],
    queryFn: fetchEmailTemplateCategories,
    staleTime: 0,
    gcTime: 0
  });

  const templates: EmailTemplateListItem[] = listData?.items ?? [];
  const totalRecords = listData?.totalRecords ?? 0;
  const totalPages = Math.ceil(totalRecords / rowsPerPage);
  const startIdx = totalRecords > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx = Math.min(currentPage * rowsPerPage, totalRecords);

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplateListItem | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [htmlViewOpen, setHtmlViewOpen] = useState(false);
  const [htmlViewId, setHtmlViewId] = useState<number | null>(null);
  const [sendTestDialogOpen, setSendTestDialogOpen] = useState(false);
  const [sendTestTemplate, setSendTestTemplate] = useState<EmailTemplateListItem | null>(null);
  const [sendTestEmailAddress, setSendTestEmailAddress] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);

  // ── Form state ───────────────────────────────────────────────────────────
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formCategory, setFormCategory] = useState<number | "">("");
  const [formBody, setFormBody] = useState("");
  const [formStatus, setFormStatus] = useState<number>(1);
  const [formReceiver, setFormReceiver] = useState("");
  const [formTriggerAction, setFormTriggerAction] = useState("");
  const [bodyEditMode, setBodyEditMode] = useState<"visual" | "html">("visual");
  const [showValidation, setShowValidation] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const receiverInputRef = useRef<HTMLInputElement>(null);
  const triggerInputRef = useRef<HTMLInputElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [filterCategoryPopoverOpen, setFilterCategoryPopoverOpen] = useState(false);

  // ── Preview & HTML data (on-demand) ──────────────────────────────────────
  const { data: previewData, isLoading: isLoadingPreview } = useQuery({
    queryKey: ["email-template-preview", previewId],
    queryFn: () => fetchEmailTemplateById(previewId!),
    enabled: !!previewId && previewDialogOpen,
    staleTime: 0,
    gcTime: 0
  });

  const { data: htmlData, isLoading: isLoadingHtml } = useQuery({
    queryKey: ["email-template-html", htmlViewId],
    queryFn: () => fetchEmailTemplateById(htmlViewId!),
    enabled: !!htmlViewId && htmlViewOpen,
    staleTime: 0,
    gcTime: 0
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["email-templates"] });

  const createMutation = useMutation({
    mutationFn: createEmailTemplate,
    onSuccess: () => {
      toast({ title: "Template created successfully" });
      setDialogOpen(false);
      invalidate();
    },
    onError: () => toast({ title: "Failed to create template", variant: "destructive" })
  });

  const updateMutation = useMutation({
    mutationFn: updateEmailTemplate,
    onSuccess: () => {
      toast({ title: "Template updated successfully" });
      setDialogOpen(false);
      invalidate();
    },
    onError: () => toast({ title: "Failed to update template", variant: "destructive" })
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmailTemplate,
    onSuccess: () => {
      toast({ title: "Template deleted successfully" });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      invalidate();
    },
    onError: () => toast({ title: "Failed to delete template", variant: "destructive" })
  });

  // ── Open create dialog ───────────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormSubject("");
    setFormCategory("");
    setFormBody("");
    setFormStatus(1);
    setFormReceiver("");
    setFormTriggerAction("");
    setBodyEditMode("visual");
    setShowValidation(false);
    setDialogOpen(true);
  };

  // ── Open edit dialog (fetch template detail) ─────────────────────────────
  const openEdit = async (template: EmailTemplateListItem) => {
    try {
      const detail = await fetchEmailTemplateById(template.id);
      const bodyHtml = detail.bodyHtml || "";
      // Pre-set the ref synchronously so handleIframeLoad can use it immediately
      latestFormBodyRef.current = bodyHtml;
      setEditingId(template.id);
      setFormName(detail.name);
      setFormSubject(detail.subject);
      setFormCategory(detail.category);
      setFormBody(bodyHtml);
      setFormStatus(detail.status);
      setFormReceiver(detail.receiver || "");
      setFormTriggerAction(detail.triggerAction || "");
      setBodyEditMode("visual");
      setShowValidation(false);
      setDialogOpen(true);
    } catch {
      toast({ title: "Failed to load template details", variant: "destructive" });
    }
  };

  // ── Open duplicate (fetch via duplicate endpoint) ────────────────────────
  const openDuplicate = async (template: EmailTemplateListItem) => {
    try {
      const dup = await fetchEmailTemplateDuplicate(template.id);
      setEditingId(null);
      setFormName(dup.name);
      setFormSubject(dup.subject);
      setFormCategory(dup.category);
      setFormBody(dup.bodyHtml || "");
      setFormStatus(dup.status);
      setFormReceiver(dup.receiver || "");
      setFormTriggerAction(dup.triggerAction || "");
      setBodyEditMode("visual");
      setShowValidation(false);
      setDialogOpen(true);
    } catch {
      toast({ title: "Failed to duplicate template", variant: "destructive" });
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const isBodyEmpty = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return !tmp.textContent?.trim();
  };

  const handleSave = () => {
    const trimmedName = formName.trim();
    const trimmedSubject = formSubject.trim();
    const trimmedReceiver = formReceiver.trim();
    const trimmedTrigger = formTriggerAction.trim();
    const bodyIsEmpty = isBodyEmpty(formBody);

    const isFieldsValid = editingId === null ? (!trimmedName || formCategory === "" || !trimmedSubject || !trimmedReceiver || !trimmedTrigger || bodyIsEmpty) : (!trimmedName || !trimmedSubject || bodyIsEmpty);

    if (isFieldsValid) {
      setShowValidation(true);
      toast({ title: "Please fill in all required fields", variant: "destructive" });

      // Focus first error
      if (!trimmedName) {
        nameInputRef.current?.focus();
      } else if (editingId === null && formCategory === "") {
        categoryTriggerRef.current?.focus();
      } else if (!trimmedSubject) {
        subjectInputRef.current?.focus();
      } else if (editingId === null && !trimmedReceiver) {
        receiverInputRef.current?.focus();
      } else if (editingId === null && !trimmedTrigger) {
        triggerInputRef.current?.focus();
      } else if (bodyIsEmpty) {
        if (bodyEditMode === "visual") visualEditorRef.current?.contentWindow?.focus();
      }
      return;
    }

    const payload = {
      name: trimmedName,
      subject: trimmedSubject,
      bodyHtml: formBody,
      category: Number(formCategory),
      status: formStatus,
      receiver: formReceiver.trim(),
      triggerAction: formTriggerAction.trim()
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSendTestEmail = async () => {
    if (!sendTestTemplate || !sendTestEmailAddress.trim()) return;
    setIsSendingTest(true);
    try {
      const result = await sendTestEmail(sendTestTemplate.id, sendTestEmailAddress.trim());
      if (result.success) {
        toast({ title: result.message || "Test email sent successfully" });
        setSendTestDialogOpen(false);
        setSendTestTemplate(null);
        setSendTestEmailAddress("");
      } else {
        toast({ title: result.message || "Failed to send test email", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to send test email", variant: "destructive" });
    } finally {
      setIsSendingTest(false);
    }
  };

  const visualEditorRef = useRef<HTMLIFrameElement>(null);

  const isFirstLoadRef = useRef(true);
  const latestFormBodyRef = useRef(formBody);
  useEffect(() => {
    latestFormBodyRef.current = formBody;
  }, [formBody]);

  // Helper to get iframe document body
  const getIframeBody = useCallback(() => {
    const iframe = visualEditorRef.current;
    return iframe?.contentDocument?.body ?? null;
  }, []);

  const getIframeDoc = useCallback(() => {
    return visualEditorRef.current?.contentDocument ?? null;
  }, []);

  // Sync formBody into iframe when switching modes or loading
  useEffect(() => {
    const body = getIframeBody();
    if (body && body !== getIframeDoc()?.activeElement) {
      if (body.innerHTML !== formBody) {
        body.innerHTML = formBody;
      }
    }
  }, [formBody, bodyEditMode, dialogOpen, getIframeBody, getIframeDoc]);

  // Reset first load flag when dialog opens or editingId changes
  useEffect(() => {
    if (dialogOpen) {
      isFirstLoadRef.current = true;
    }
  }, [dialogOpen, editingId]);

  useEffect(() => {
    if (!dialogOpen || bodyEditMode !== "visual") return;
    const timer = setTimeout(() => {
      const iframeDoc = visualEditorRef.current?.contentDocument;
      if (iframeDoc?.body) {
        const current = iframeDoc.body.innerHTML;
        const expected = latestFormBodyRef.current;
        if (current !== expected) {
          iframeDoc.body.innerHTML = expected;
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [dialogOpen, editingId, bodyEditMode]);

  // Initialize iframe with designMode and content when it loads
  const handleIframeLoad = useCallback(() => {
    const iframe = visualEditorRef.current;
    if (!iframe) return;
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;

    iframeDoc.designMode = "on";
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html><head><style>body{margin:0;padding:8px;}</style></head><body>${latestFormBodyRef.current}</body></html>`);
    iframeDoc.close();
    iframeDoc.designMode = "on";

    // Listen for input changes inside the iframe
    iframeDoc.body.addEventListener("input", () => {
      if (iframeDoc.body) setFormBody(iframeDoc.body.innerHTML);
    });

    // Also listen for DOMSubtreeModified as a fallback for execCommand changes
    iframeDoc.addEventListener("selectionchange", () => {
      // no-op, just ensure focus tracking
    });

    isFirstLoadRef.current = false;
  }, []);

  const execBodyCommand = useCallback((command: string, val?: string) => {
    const iframeDoc = getIframeDoc();
    if (!iframeDoc) return;

    // Focus the iframe first so execCommand targets it
    visualEditorRef.current?.contentWindow?.focus();

    if (command === "removeFormat") {
      iframeDoc.execCommand("removeFormat", false);
      iframeDoc.execCommand("unlink", false);
      if (iframeDoc.queryCommandState("insertOrderedList")) {
        iframeDoc.execCommand("insertOrderedList", false);
      }
      if (iframeDoc.queryCommandState("insertUnorderedList")) {
        iframeDoc.execCommand("insertUnorderedList", false);
      }
    } else {
      iframeDoc.execCommand(command, false, val);
    }
    if (iframeDoc.body) setFormBody(iframeDoc.body.innerHTML);
  }, [getIframeDoc]);

  const handleBodyInput = useCallback(() => {
    const body = getIframeBody();
    if (body) setFormBody(body.innerHTML);
  }, [getIframeBody]);

  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const savedRangeRef = useRef<Range | null>(null);

  const handleBodyLink = useCallback(() => {
    const iframeDoc = getIframeDoc();
    const sel = iframeDoc?.getSelection?.() ?? null;
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    setLinkUrl("");
    setLinkDialogOpen(true);
  }, [getIframeDoc]);

  const confirmInsertLink = useCallback(() => {
    if (!linkUrl.trim()) return;

    const iframeDoc = getIframeDoc();
    if (!iframeDoc) return;

    visualEditorRef.current?.contentWindow?.focus();
    const sel = iframeDoc.getSelection?.();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }

    let url = linkUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("mailto:")) {
      url = "https://" + url;
    }

    iframeDoc.execCommand("createLink", false, url);
    if (iframeDoc.body) setFormBody(iframeDoc.body.innerHTML);
    setLinkDialogOpen(false);
  }, [linkUrl, getIframeDoc]);

  // Image insert dialog
  const handleBodyImage = useCallback(() => {
    const iframeDoc = getIframeDoc();
    const sel = iframeDoc?.getSelection?.() ?? null;
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    setImageUrl("");
    setImageAlt("");
    setImageDialogOpen(true);
  }, [getIframeDoc]);

  const confirmInsertImage = useCallback(() => {
    if (!imageUrl.trim()) return;
    const iframeDoc = getIframeDoc();
    if (!iframeDoc) return;

    visualEditorRef.current?.contentWindow?.focus();
    const imgHtml = `<img src="${imageUrl.trim()}" alt="${imageAlt.trim()}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`;
    const sel = iframeDoc.getSelection?.();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    iframeDoc.execCommand("insertHTML", false, imgHtml);
    if (iframeDoc.body) setFormBody(iframeDoc.body.innerHTML);
    setImageDialogOpen(false);
  }, [imageUrl, imageAlt, getIframeDoc]);

  const bodyToolbarButtons = [
    { Icon: Bold, command: "bold", label: "Bold" },
    { Icon: Italic, command: "italic", label: "Italic" },
    { Icon: Underline, command: "underline", label: "Underline" },
    { Icon: Link, command: "link", label: "Insert Link" },
    { Icon: ListOrdered, command: "insertOrderedList", label: "Ordered List" },
    { Icon: List, command: "insertUnorderedList", label: "Unordered List" },
    { Icon: RemoveFormatting, command: "removeFormat", label: "Clear Formatting" },
    { Icon: ImageIcon, command: "image", label: "Insert Image" }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Email Templates">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">
            Email Template Management
          </h1>
          <p className="text-sm text-muted-foreground">Manage email templates with HTML content</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 w-64"
                  data-testid="input-search-templates"
                />
              </div>
              <Popover open={filterCategoryPopoverOpen} onOpenChange={setFilterCategoryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={filterCategoryPopoverOpen} className="w-[300px] justify-between font-normal text-sm h-9" data-testid="select-category-filter">
                    {categoryFilter === "all" ? "All Categories" : categories.find((c) => String(c.id) === categoryFilter)?.label || "Select Category"}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 bg-popover" align="start">
                  <Command className="bg-transparent">
                    <CommandInput placeholder="Search category..." />
                    <CommandList className="max-h-[264px]" onWheel={(e) => e.stopPropagation()}>
                      <CommandEmpty>No category found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setCategoryFilter("all");
                            setCurrentPage(1);
                            setFilterCategoryPopoverOpen(false);
                          }}
                        >
                          <Check className={`h-4 w-4 mr-2 ${categoryFilter === "all" ? "opacity-100" : "opacity-0"}`} />
                          All Categories
                        </CommandItem>
                        {categories.map((c) => (
                          <CommandItem
                            key={c.id}
                            onSelect={() => {
                              setCategoryFilter(String(c.id));
                              setCurrentPage(1);
                              setFilterCategoryPopoverOpen(false);
                            }}
                          >
                            <Check className={`h-4 w-4 mr-2 ${categoryFilter === String(c.id) ? "opacity-100" : "opacity-0"}`} />
                            {c.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-40 h-9" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="1">Draft</SelectItem>
                  <SelectItem value="2">Active</SelectItem>
                  <SelectItem value="3">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openCreate} className="bg-[#405189] hover:bg-[#405189]/90 text-white" data-testid="button-create-template">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Template
            </Button>
          </CardHeader>
          <CardContent className="p-0">

            {/* ── Table ── */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <SortHeader field="name" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      Name
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Receiver</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trigger</th>
                    <SortHeader field="status" sortField={sortField} sortDir={sortDir} handleSort={handleSort} className="text-right whitespace-nowrap w-[1%]">
                      Status
                    </SortHeader>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap w-[1%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingList ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#405189] mx-auto" />
                      </td>
                    </tr>
                  ) : templates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground" data-testid="text-no-templates">
                        <Mail className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                        No templates found
                      </td>
                    </tr>
                  ) : (
                    templates.map((template, idx) => (
                      <tr key={template.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors" data-testid={`row-template-${template.id}`}>
                        <td className="px-4 py-3 font-medium max-w-[160px] truncate" data-testid={`text-template-name-${template.id}`}>
                          {template.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground break-words min-w-[200px] max-w-[260px]" data-testid={`text-template-subject-${template.id}`}>
                          {template.subject}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">
                          {template.receiver || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground break-words max-w-[160px]">
                          {template.triggerAction || "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap w-[1%]">{statusBadge(template.statusName)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap w-[1%]">
                          <div className="flex items-center justify-end">
                            <div className="inline-flex rounded-md shadow-sm">
                              {/* Preview */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-r-none border-r-0 text-emerald-600 hover:text-emerald-700 hover:bg-muted/30"
                                    onClick={() => {
                                      setPreviewId(template.id);
                                      setPreviewDialogOpen(true);
                                    }}
                                    data-testid={`button-preview-${template.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Preview Template</TooltipContent>
                              </Tooltip>

                              {/* Edit */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-none border-r-0 text-[#f7b84b] hover:text-[#f7b84b] hover:bg-muted/30"
                                    onClick={() => openEdit(template)}
                                    data-testid={`button-edit-${template.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit Template</TooltipContent>
                              </Tooltip>

                              {/* Duplicate */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-none border-r-0 text-blue-600 hover:text-blue-700 hover:bg-muted/30"
                                    onClick={() => openDuplicate(template)}
                                    data-testid={`button-duplicate-${template.id}`}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Duplicate Template</TooltipContent>
                              </Tooltip>

                              {/* HTML View */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 rounded-none border-r-0 text-slate-600 hover:text-slate-700 hover:bg-muted/30"
                                    onClick={() => {
                                      setHtmlViewId(template.id);
                                      setHtmlViewOpen(true);
                                    }}
                                    data-testid={`button-view-html-${template.id}`}
                                  >
                                    <Code className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View HTML</TooltipContent>
                              </Tooltip>

                              {/* Send Test Email */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className={cn(
                                      "h-8 w-8 text-[#405189] hover:text-[#405189] hover:bg-muted/30",
                                      hasActionPermission("content management", "delete") ? "rounded-none border-r-0" : "rounded-l-none"
                                    )}
                                    onClick={() => {
                                      setSendTestTemplate(template);
                                      setSendTestEmailAddress("");
                                      setSendTestDialogOpen(true);
                                    }}
                                    data-testid={`button-send-test-${template.id}`}
                                  >
                                    <Mail className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Send Test Email</TooltipContent>
                              </Tooltip>

                              {/* Delete */}
                              {hasActionPermission("content management", "delete") && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-8 w-8 rounded-l-none text-[#f06548] hover:text-[#f06548] hover:bg-muted/30"
                                      onClick={() => {
                                        setTemplateToDelete(template);
                                        setDeleteDialogOpen(true);
                                      }}
                                      data-testid={`button-delete-${template.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete Template</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            <PaginationControls
              currentPage={currentPage}
              totalCount={totalRecords}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(v) => {
                setRowsPerPage(v);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              dataTestId="pagination-email-templates"
            />
          </CardContent>
        </Card>

        {/* ── Create / Edit Dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">{editingId !== null ? "Edit Email Template" : "Create Email Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-2">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">General Information</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Template Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      ref={nameInputRef}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Welcome Registered User"
                      className={showValidation && !formName.trim() ? "border-destructive focus-visible:ring-destructive" : ""}
                      data-testid="input-template-name"
                    />
                    {showValidation && !formName.trim() && <p className="text-[10px] text-destructive font-medium">Template Name is required</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Category {editingId === null && <span className="text-destructive">*</span>}
                    </Label>
                    <Popover open={editingId !== null ? false : categoryPopoverOpen} onOpenChange={editingId !== null ? undefined : setCategoryPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          ref={categoryTriggerRef}
                          variant="outline"
                          role="combobox"
                          aria-expanded={categoryPopoverOpen}
                          disabled={editingId !== null}
                          className={cn(
                            "w-full justify-between font-normal px-3",
                            editingId === null && showValidation && formCategory === "" ? "border-destructive focus-visible:ring-destructive" : "",
                            !formCategory && "text-muted-foreground",
                            editingId !== null && "bg-muted cursor-not-allowed"
                          )}
                          data-testid="select-template-category"
                        >
                          <span className="truncate">{formCategory ? categories.find((c) => c.id === formCategory)?.label || "Select Category" : "Select Category"}</span>
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 bg-popover" align="start" style={{ width: categoryTriggerRef.current?.offsetWidth }}>
                        <Command className="bg-transparent">
                          <CommandInput placeholder="Search category..." />
                          <CommandList className="max-h-[264px]" onWheel={(e) => e.stopPropagation()}>
                            <CommandEmpty>No category found.</CommandEmpty>
                            <CommandGroup>
                              {categories.map((c) => (
                                <CommandItem
                                  key={c.id}
                                  onSelect={() => {
                                    setFormCategory(c.id);
                                    setCategoryPopoverOpen(false);
                                  }}
                                >
                                  <Check className={`h-4 w-4 mr-2 ${formCategory === c.id ? "opacity-100" : "opacity-0"}`} />
                                  {c.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {editingId === null && showValidation && formCategory === "" && <p className="text-[10px] text-destructive font-medium">Category is required</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={String(formStatus)} onValueChange={(v) => setFormStatus(Number(v))}>
                      <SelectTrigger data-testid="select-template-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Draft</SelectItem>
                        <SelectItem value="2">Active</SelectItem>
                        <SelectItem value="3">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label>Email Receiver {editingId === null && <span className="text-destructive">*</span>}</Label>
                    <Input
                      ref={receiverInputRef}
                      value={formReceiver}
                      onChange={(e) => setFormReceiver(e.target.value)}
                      placeholder={editingId === null ? "e.g., Registered Users, Investors" : "—"}
                      readOnly={editingId !== null}
                      className={cn(
                        editingId !== null ? "bg-muted cursor-not-allowed" : "",
                        editingId === null && showValidation && !formReceiver.trim() ? "border-destructive focus-visible:ring-destructive" : ""
                      )}
                      data-testid="input-template-receiver"
                    />
                    {editingId === null && showValidation && !formReceiver.trim() && <p className="text-[10px] text-destructive font-medium">Receiver is required</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Action when triggered {editingId === null && <span className="text-destructive">*</span>}</Label>
                    <Input
                      ref={triggerInputRef}
                      value={formTriggerAction}
                      onChange={(e) => setFormTriggerAction(e.target.value)}
                      placeholder={editingId === null ? "e.g., On Registration, On Investment Approval" : "—"}
                      readOnly={editingId !== null}
                      className={cn(
                        editingId !== null ? "bg-muted cursor-not-allowed" : "",
                        editingId === null && showValidation && !formTriggerAction.trim() ? "border-destructive focus-visible:ring-destructive" : ""
                      )}
                      data-testid="input-template-trigger"
                    />
                    {editingId === null && showValidation && !formTriggerAction.trim() && <p className="text-[10px] text-destructive font-medium">Trigger action is required</p>}
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Email Content</h4>
                <div className="space-y-2">
                  <Label>
                    Subject Line <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    ref={subjectInputRef}
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="e.g., Welcome to CataCap - Get Started"
                    className={showValidation && !formSubject.trim() ? "border-destructive focus-visible:ring-destructive" : ""}
                    data-testid="input-template-subject"
                  />
                  {showValidation && !formSubject.trim() && <p className="text-[10px] text-destructive font-medium">Subject Line is required</p>}
                  <p className="text-[11px] text-muted-foreground">
                    Use {"{{variableName}}"} for dynamic content (e.g., {"{{firstName}}"}, {"{{investmentName}}"})
                  </p>
                </div>
              </div>

              {/* ── Body editor ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Body (HTML)</Label>
                  <div className="flex items-center rounded-md border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setBodyEditMode("visual")}
                      className={`px-3 py-1 transition-colors ${bodyEditMode === "visual" ? "bg-[#405189] text-white" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
                    >
                      Visual
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const body = visualEditorRef.current?.contentDocument?.body;
                        if (body) setFormBody(body.innerHTML);
                        setBodyEditMode("html");
                      }}
                      className={`px-3 py-1 border-l transition-colors ${bodyEditMode === "html" ? "bg-[#405189] text-white" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
                    >
                      HTML
                    </button>
                  </div>
                </div>

                {bodyEditMode === "visual" ? (
                  <div className={`border rounded-md overflow-hidden ${showValidation && isBodyEmpty(formBody) ? "border-destructive" : ""}`}>
                    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-muted/40">
                      {bodyToolbarButtons.map((btn) => (
                        <button
                          key={btn.command}
                          type="button"
                          title={btn.label}
                          onClick={(e) => {
                            e.preventDefault();
                            if (btn.command === "link") handleBodyLink();
                            else if (btn.command === "image") handleBodyImage();
                            else execBodyCommand(btn.command);
                          }}
                          className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
                        >
                          <btn.Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                    <div className="border-t overflow-hidden">
                      <iframe
                        key={`visual-editor-${editingId ?? "new"}`}
                        ref={visualEditorRef}
                        onLoad={handleIframeLoad}
                        className="w-full border-0 outline-none bg-white"
                        style={{ minHeight: "400px", maxHeight: "660px", height: "500px" }}
                        title="Email Body Editor"
                        data-testid="editor-template-body-visual"
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    className={`w-full min-h-[240px] rounded-md border px-3 py-2 text-xs font-mono bg-muted/20 focus:outline-none focus:ring-1 focus:ring-ring resize-y leading-relaxed ${showValidation && isBodyEmpty(formBody) ? "border-destructive focus:ring-destructive" : ""}`}
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    spellCheck={false}
                    placeholder="Paste or write HTML here..."
                    data-testid="editor-template-body-html"
                  />
                )}
                {showValidation && isBodyEmpty(formBody) && <p className="text-[10px] text-destructive font-medium">Email body is required</p>}

                <p className="text-xs text-muted-foreground">
                  Use <code>{"{{variableName}}"}</code> for dynamic content. Switch to <strong>HTML</strong> tab to write or paste raw HTML.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting} data-testid="button-cancel-template">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting} className="bg-[#405189] hover:bg-[#405189]/90" data-testid="button-save-template">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId !== null ? "Update Template" : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Dialog ── */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Email Template</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Are you sure you want to delete <strong>"{templateToDelete?.name}"</strong>? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => templateToDelete && deleteMutation.mutate(templateToDelete.id)} disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Preview Dialog ── */}
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle data-testid="text-preview-title">Preview: {previewData?.name}</DialogTitle>
            </DialogHeader>
            {isLoadingPreview ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#405189]" />
              </div>
            ) : (
              previewData && (
                <div className="flex-1 min-h-0 px-0">
                  <iframe title="Email Preview" className="w-full h-full min-h-[600px] border-0" srcDoc={previewData?.bodyHtml || ""} />
                </div>
              )
            )}
            <DialogFooter className="p-4 border-t bg-white dark:bg-muted/10">
              <Button variant="outline" onClick={() => setPreviewDialogOpen(false)} data-testid="button-close-preview">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── HTML View Dialog ── */}
        <Dialog open={htmlViewOpen} onOpenChange={setHtmlViewOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="text-html-view-title">HTML Source: {htmlData?.name}</DialogTitle>
            </DialogHeader>
            {isLoadingHtml ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#405189]" />
              </div>
            ) : (
              htmlData && (
                <div className="space-y-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Raw HTML source code</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(htmlData.bodyHtml || "");
                        toast({ title: "HTML copied to clipboard" });
                      }}
                      data-testid="button-copy-html"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy HTML
                    </Button>
                  </div>
                  <pre className="p-4 rounded-md bg-muted/50 border text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed" data-testid="text-html-source">
                    {htmlData.bodyHtml || "(empty)"}
                  </pre>
                </div>
              )
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setHtmlViewOpen(false)} data-testid="button-close-html-view">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Image Insert Dialog ── */}
        <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Insert Image</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="img-url">
                  Image URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="img-url"
                  placeholder="https://example.com/image.png"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmInsertImage();
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="img-alt">
                  Alt Text <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="img-alt"
                  placeholder="Describe the image..."
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmInsertImage();
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImageDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmInsertImage} disabled={!imageUrl.trim()} className="bg-[#405189] hover:bg-[#405189]/90">
                Insert Image
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Link Insert Dialog ── */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Insert Hyperlink</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="link-url">
                  URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="link-url"
                  placeholder="domain.com or https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmInsertLink();
                  }}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">Format: https://google.com or simply google.com</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmInsertLink} disabled={!linkUrl.trim()} className="bg-[#405189] hover:bg-[#405189]/90">
                Insert Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Send Test Email Dialog ── */}
        <Dialog open={sendTestDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setSendTestDialogOpen(false);
            setSendTestTemplate(null);
            setSendTestEmailAddress("");
          }
        }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Send Test Email</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {sendTestTemplate && (
                <p className="text-sm text-muted-foreground">
                  Template: <span className="font-medium text-foreground">{sendTestTemplate.name}</span>
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="test-email-address">
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="test-email-address"
                  type="email"
                  placeholder="recipient@example.com"
                  value={sendTestEmailAddress}
                  onChange={(e) => setSendTestEmailAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sendTestEmailAddress.trim()) handleSendTestEmail();
                  }}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendTestDialogOpen(false)} disabled={isSendingTest}>
                Cancel
              </Button>
              <Button
                onClick={handleSendTestEmail}
                disabled={!sendTestEmailAddress.trim() || isSendingTest}
                className="bg-[#405189] hover:bg-[#405189]/90"
              >
                {isSendingTest && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
