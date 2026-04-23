import { useState, useMemo, useRef } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { MoreVertical, Edit, Trash2, ExternalLink, Calendar, Search, Plus, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Upload, X } from "lucide-react";
import { formatLongDate, formatTime12h, formatDateISO } from "@/helpers/format";
import { RichTextEditor } from "../components/RichTextEditor";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as eventApi from "../api/event/eventApi";
import { useAuth } from "@/contexts/AuthContext";
import { useSort } from "../hooks/useSort";
import { SortHeader } from "../components/ui/table-sort";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { Loader2 } from "lucide-react";
import { useDebounce } from "../hooks/useDebounce";
import { getUrlBlobContainerImage } from "@/lib/image-utils";
import { PaginationControls } from "../components/ui/pagination-controls";
import catacapLogo from "@assets/CataCap-Logo.png";


type Event = eventApi.EventApiItem;

const emptyForm = {
  title: "",
  description: "",
  eventDate: "",
  eventTime: "",
  timeVal: "", // HH:mm
  timezone: "IST",
  registrationLink: "",
  status: true,
  image: "",
  imageFileName: "",
  duration: "",
  type: ""
};

type FormState = typeof emptyForm;

export default function EventManagement() {
  const { toast } = useToast();
  const { hasActionPermission } = useAuth();
  const [search, setSearch] = useState("");
  const { sortField, sortDir, handleSort: originalHandleSort } = useSort<keyof Event>(null, null);

  const handleSort = (field: keyof Event) => {
    originalHandleSort(field);
    setCurrentPage(1);
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState<Event | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(search, 500);

  const effectiveSearch = useMemo(() => {
    const trimmed = debouncedSearch.trim();
    if (trimmed.length === 0) return "";
    if (trimmed.length < 3) return "";
    return trimmed;
  }, [debouncedSearch]);

  // React Query: Fetching events
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-events", currentPage, effectiveSearch, sortField, sortDir],
    queryFn: () =>
      eventApi.fetchAdminEvents({
        currentPage: currentPage,
        perPage: rowsPerPage,
        searchValue: effectiveSearch || undefined,
        sortField: sortField || undefined,
        sortDirection: sortDir || undefined
      }),
    staleTime: 0,
    gcTime: 0
  });

  const events = data?.items || [];
  const totalCount = data?.totalRecords || 0;
  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const startIdx = totalCount > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx = Math.min(currentPage * rowsPerPage, totalCount);

  const createMutation = useMutation({
    mutationFn: (data: any) => eventApi.createOrUpdateEvent(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] }); // Updated queryKey
      toast({ title: result.message || "Event created successfully" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to create event", variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => eventApi.createOrUpdateEvent({ id, ...data }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] }); // Updated queryKey
      toast({ title: result.message || "Event updated successfully" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update event", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => eventApi.deleteEvent(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] }); // Updated queryKey
      toast({ title: result.message || "Event deleted" });
      setDeleteDialogOpen(false);
      setDeletingEvent(null);
    },
    onError: () => {
      toast({ title: "Failed to delete event", variant: "destructive" });
    }
  });

  const openCreate = () => {
    setEditingEvent(null);
    setForm(emptyForm);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (event: Event) => {
    // Parse eventTime (e.g., "14:30 IST")
    let timeVal = "";
    let timezone = "IST";
    if (event.eventTime) {
      const parts = event.eventTime.split(" ");
      if (parts[0]) timeVal = parts[0];
      if (parts[1]) timezone = parts[1];
    }

    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      timeVal,
      timezone,
      registrationLink: event.registrationLink,
      status: event.status,
      image: event.image,
      imageFileName: event.imageFileName || "",
      duration: event.duration || "",
      type: event.type || ""
    });
    setErrors({});
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
    setForm(emptyForm);
    setErrors({});
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleSave = () => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) {
      newErrors.title = "Event title is required";
    }
    if (!form.eventDate) {
      newErrors.eventDate = "Event date is required";
    }
    if (!form.timeVal) {
      newErrors.eventTime = "Event time is required";
    }
    if (!form.registrationLink) {
      newErrors.registrationLink = "Registration link is required";
    } else {
      try {
        new URL(form.registrationLink);
      } catch {
        newErrors.registrationLink = "Please enter a valid URL (e.g., https://example.com)";
      }
    }
    if (!form.image) {
      newErrors.image = "Event image is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      registrationLink: form.registrationLink.trim(),
      eventTime: `${form.timeVal} ${form.timezone}`.trim(),
      image: editingEvent && !form.image?.startsWith("data:") ? null : form.image
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };


  const parseLocalDate = (s: string): Date | undefined => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return undefined;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const selectedDate = form.eventDate ? parseLocalDate(form.eventDate) : undefined;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout title="Event Management">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-events-title">
              Event Management
            </h1>
            <p className="text-sm text-muted-foreground">Create and manage platform events</p>
          </div>

          {hasActionPermission("event registrations", "manage") && (
            <Button onClick={openCreate} className="bg-[#405189] hover:bg-[#405189]/90 text-white" data-testid="button-create-event">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Event
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap border-b px-6 py-4">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
                data-testid="input-search-events"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-12">#</th>
                    <SortHeader field="title" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      Event Title
                    </SortHeader>
                    <SortHeader field="eventDate" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      Date
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Registration</th>
                    <SortHeader field="status" sortField={sortField} sortDir={sortDir} handleSort={handleSort}>
                      Status
                    </SortHeader>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Duration</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-muted-foreground">
                        Loading events...
                      </td>
                    </tr>
                  ) : events.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-muted-foreground">
                        {search ? "No events match your search." : 'No events yet. Click "Add Event" to create one.'}
                      </td>
                    </tr>
                  ) : (
                    events.map((event, idx) => (
                      <tr key={event.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-event-${event.id}`}>
                        <td className="px-4 py-3 text-muted-foreground">{startIdx + idx}</td>
                        <td className="px-4 py-3 font-medium text-[#405189]" data-testid={`text-event-title-${event.id}`}>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-14 flex items-center justify-center shrink-0">
                              <img
                                src={getUrlBlobContainerImage(event.image) || catacapLogo}
                                alt={event.title}
                                className="max-h-10 max-w-14 object-contain rounded"
                                onError={(e) => { (e.target as HTMLImageElement).src = catacapLogo; }}
                              />
                            </div>
                            <span className="font-medium line-clamp-1">{event.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-testid={`text-event-date-${event.id}`}>
                          {formatLongDate(event.eventDate)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm" data-testid={`text-event-time-${event.id}`}>
                          {(() => {
                            if (!event.eventTime) return "—";
                            const parts = event.eventTime.split(" ");
                            const time = formatTime12h(parts[0]);
                            const tz = parts[1] || "";
                            return `${time} ${tz}`.trim();
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {event.registrationLink ? (
                            <a
                              href={event.registrationLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#405189] hover:underline"
                              data-testid={`link-event-reg-${event.id}`}
                            >
                              <ExternalLink className="h-3 w-3" /> Link
                            </a>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-2 py-0 h-4 border-0 no-default-hover-elevate no-default-active-elevate",
                              event.status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            )}
                            data-testid={`badge-event-status-${event.id}`}
                          >
                            {event.status ? "Active" : "Draft"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{event.type || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{event.duration || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end">
                            <div className="inline-flex rounded-md shadow-sm">
                              {hasActionPermission("event registrations", "manage") && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className={cn(
                                        "h-8 w-8 text-[#f7b84b] hover:text-[#f7b84b] hover:bg-[#f7b84b]/5",
                                        hasActionPermission("event registrations", "delete") ? "rounded-r-none border-r-0" : ""
                                      )}
                                      onClick={() => openEdit(event)}
                                      data-testid={`button-edit-event-${event.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Event</TooltipContent>
                                </Tooltip>
                              )}
                              {hasActionPermission("event registrations", "delete") && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className={cn(
                                        "h-8 w-8 text-[#f06548] hover:text-[#f06548] hover:bg-[#f06548]/5",
                                        hasActionPermission("event registrations", "manage") ? "rounded-l-none" : ""
                                      )}
                                      onClick={() => {
                                        setDeletingEvent(event);
                                        setDeleteDialogOpen(true);
                                      }}
                                      data-testid={`button-delete-event-${event.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete Event</TooltipContent>
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

            <PaginationControls
              currentPage={currentPage}
              totalCount={totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={(v) => {
                setRowsPerPage(v);
                setCurrentPage(1);
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">{editingEvent ? "Edit Event" : "Create Event"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="event-title">
                Event Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event-title"
                placeholder="Enter event title"
                className={cn("h-12 px-4", errors.title && "border-destructive focus-visible:ring-destructive")}
                value={form.title}
                onChange={(e) => {
                  setForm((f) => ({ ...f, title: e.target.value }));
                  if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
                }}
                data-testid="input-event-title"
              />
              {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <RichTextEditor
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Enter event description..."
                className="min-h-[160px]"
                data-testid="editor-event-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen} modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-12 px-4 transition-colors",
                        errors.eventDate ? "!border-destructive !ring-destructive" : "border-input"
                      )}
                      data-testid="button-event-date"
                    >
                      <Calendar className="mr-2 h-4 w-4 shrink-0" />
                      {selectedDate ? formatLongDate(selectedDate) : <span className="text-muted-foreground">Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => {
                        setForm((f) => ({
                          ...f,
                          eventDate: d ? formatDateISO(d) : ""
                        }));
                        if (errors.eventDate) setErrors((prev) => ({ ...prev, eventDate: undefined }));
                        setCalendarOpen(false);
                      }}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {errors.eventDate && <p className="text-xs text-destructive mt-1">{errors.eventDate}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-time">
                  Time <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start">
                  <div className="relative">
                    <style>{`
                      #event-time::-webkit-calendar-picker-indicator {
                        display: none;
                        -webkit-appearance: none;
                      }
                    `}</style>
                    <Input
                      id="event-time"
                      type="time"
                      className={cn(
                        "h-12 px-4 w-[120px] rounded-r-none border-r-0 focus-visible:ring-1",
                        errors.eventTime ? "border-destructive focus-visible:ring-destructive z-10" : "focus-visible:ring-ring"
                      )}
                      value={form.timeVal}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, timeVal: e.target.value }));
                        if (errors.eventTime) setErrors((prev) => ({ ...prev, eventTime: undefined }));
                      }}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {
                          console.log("showPicker not supported", err);
                        }
                      }}
                      data-testid="input-event-time"
                    />
                  </div>
                  <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                    <SelectTrigger
                      className={cn(
                        "h-12 w-[100px] rounded-l-none focus:ring-1",
                        errors.eventTime ? "border-destructive focus:ring-destructive z-10" : "focus:ring-ring"
                      )}
                      data-testid="select-event-timezone"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IST">IST</SelectItem>
                      <SelectItem value="EST">EST</SelectItem>
                      <SelectItem value="PST">PST</SelectItem>
                      <SelectItem value="CST">CST</SelectItem>
                      <SelectItem value="MST">MST</SelectItem>
                      <SelectItem value="CET">CET</SelectItem>
                      <SelectItem value="EET">EET</SelectItem>
                      <SelectItem value="AST">AST</SelectItem>
                      <SelectItem value="GMT">GMT</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.timeVal && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Preview: <span className="font-medium text-foreground">{formatTime12h(form.timeVal)} {form.timezone}</span>
                  </p>
                )}
                {errors.eventTime && <p className="text-xs text-destructive mt-1">{errors.eventTime}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-registration-link">
                Registration Link <span className="text-destructive">*</span>
              </Label>

              <Input
                id="event-registration-link"
                placeholder="https://..."
                className={cn("h-12 px-4", errors.registrationLink && "border-destructive focus-visible:ring-destructive")}
                value={form.registrationLink}
                onChange={(e) => {
                  setForm((f) => ({ ...f, registrationLink: e.target.value }));
                  if (errors.registrationLink) setErrors((prev) => ({ ...prev, registrationLink: undefined }));
                }}
                data-testid="input-event-registration-link"
              />
              {errors.registrationLink && <p className="text-xs text-destructive mt-1">{errors.registrationLink}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="event-type">Event Type</Label>
                <Input
                  id="event-type"
                  placeholder="e.g. Webinar, In-person"
                  className="h-12 px-4"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  data-testid="input-event-type"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-duration">Duration</Label>
                <Input
                  id="event-duration"
                  placeholder="e.g. 1h 30m"
                  className="h-12 px-4"
                  value={form.duration}
                  onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                  data-testid="input-event-duration"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Image <span className="text-destructive">*</span></Label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.gif"
                ref={imageInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Check file size (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                      setErrors((prev) => ({ ...prev, image: "Image size must be less than 5MB" }));
                      if (imageInputRef.current) imageInputRef.current.value = "";
                      return;
                    }

                    // Check file type
                    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
                    if (!validTypes.includes(file.type)) {
                      setErrors((prev) => ({ ...prev, image: "Only JPG, PNG or GIF files are allowed" }));
                      if (imageInputRef.current) imageInputRef.current.value = "";
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const base64 = ev.target?.result as string;
                      setForm((f) => ({ ...f, image: base64, imageFileName: file.name }));
                      if (errors.image) setErrors((prev) => ({ ...prev, image: undefined }));
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                data-testid="input-event-image"
              />
              {form.image ? (
                <div className="flex items-center gap-3 mt-1.5 p-2 border rounded-md bg-muted/10">
                  <img
                    src={form.image?.startsWith("data:") ? form.image : getUrlBlobContainerImage(form.image)}
                    alt="Preview"
                    className="h-16 w-16 rounded object-cover shadow-sm"
                    onError={(e) => { (e.target as HTMLImageElement).src = catacapLogo; }}
                    data-testid="img-event-preview"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">Image selected</p>
                    <p className="text-xs text-muted-foreground">Click to replace or remove</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => imageInputRef.current?.click()}
                      title="Replace image"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setForm((f) => ({ ...f, image: "", imageFileName: "" }));
                        if (imageInputRef.current) imageInputRef.current.value = "";
                      }}
                      data-testid="button-remove-image"
                      title="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className={cn(
                    "w-full mt-1.5 h-24 border-dashed border-2 flex flex-col gap-2 hover:bg-muted/30 hover:border-muted-foreground/30 transition-all",
                    errors.image ? "border-destructive text-destructive" : "border-muted-foreground/20"
                  )}
                  onClick={() => imageInputRef.current?.click()}
                  data-testid="button-upload-image"
                >
                  <Upload className="h-6 w-6 opacity-50" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Click to upload image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG or GIF (max. 5MB)</p>
                  </div>
                </Button>
              )}
              {errors.image && <p className="text-xs text-destructive mt-1">{errors.image}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ? "Active" : "Draft"} onValueChange={(v: "Active" | "Draft") => setForm((f) => ({ ...f, status: v === "Active" }))}>
                <SelectTrigger className="h-12 px-4" data-testid="select-event-status">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={isPending} data-testid="button-cancel-event">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending} className="bg-[#405189] hover:bg-[#405189]/90 text-white min-w-[120px]" data-testid="button-save-event">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingEvent ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletingEvent(null);
        }}
        title="Delete Event"
        description={
          <span>
            Are you sure you want to delete <strong className="text-foreground">{deletingEvent?.title}</strong>? This action cannot be undone.
          </span>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deletingEvent && deleteMutation.mutate(deletingEvent.id)}
        isSubmitting={deleteMutation.isPending}
        confirmButtonClass="bg-[#f06548] text-white hover:bg-[#d0543c]"
        dataTestId="dialog-delete-confirm"
      />
    </AdminLayout>
  );
}
