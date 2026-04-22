import { useState, useEffect, useCallback } from "react";
import { formatDateTimeInZone } from "@/helpers/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Play, Save, ChevronDown, ChevronUp, Loader2, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  fetchSchedulerConfigs,
  updateSchedulerConfig,
  triggerSchedulerJob,
  toggleSchedulerJob,
  fetchSchedulerLogs,
  fetchSentReminderEmails,
  fetchSentWelcomeEmails,
  SchedulerConfig,
  SchedulerLog,
  SentEmailEntry,
  SentWelcomeEmailEntry,
} from "@/api/scheduler/schedulerApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye } from "lucide-react";

const JOB_DISPLAY_NAMES: Record<string, string> = {
  SendReminderEmail: "Send Reminder Email",
  DeleteArchivedUsers: "Delete Archived Users",
  DeleteTestUsers: "Delete Test Users",
  WelcomeSeries: "Welcome Series",
};

const JOB_DESCRIPTIONS: Record<string, string> = {
  DeleteTestUsers: "Soft-deletes test user accounts and all associated data (restorable from Archived Records)",
  WelcomeSeries: "Sends Day 1, Day 6, and Day 10 welcome emails to people who submitted the Learn More form",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "UTC",
];

interface EditState {
  hour: number;
  minuteDisplay: string;
  timezone: string;
}

export default function SchedulersTab() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SchedulerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [savingJobs, setSavingJobs] = useState<Record<string, boolean>>({});
  const [triggeringJobs, setTriggeringJobs] = useState<Record<string, boolean>>({});
  const [togglingJobs, setTogglingJobs] = useState<Record<string, boolean>>({});
  const [triggerResults, setTriggerResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [jobLogs, setJobLogs] = useState<Record<string, SchedulerLog[]>>({});
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({});
  const [sentEmailsOpen, setSentEmailsOpen] = useState(false);
  const [sentEmails, setSentEmails] = useState<SentEmailEntry[]>([]);
  const [sentWelcomeEmails, setSentWelcomeEmails] = useState<SentWelcomeEmailEntry[]>([]);
  const [sentEmailsLoading, setSentEmailsLoading] = useState(false);
  const [sentEmailsContext, setSentEmailsContext] = useState<{
    startTime: string;
    endTime: string;
    timezone: string;
    jobName: string;
  } | null>(null);

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchSchedulerConfigs();
      setConfigs(data);
      const edits: Record<string, EditState> = {};
      for (const c of data) {
        edits[c.jobName] = { hour: c.hour, minuteDisplay: String(c.minute).padStart(2, "0"), timezone: c.timezone };
      }
      setEditStates(edits);
    } catch {
      toast({ title: "Error", description: "Failed to load scheduler configurations.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleEditChange = (jobName: string, field: keyof EditState, value: string | number) => {
    setEditStates((prev) => ({
      ...prev,
      [jobName]: { ...prev[jobName], [field]: value },
    }));
  };

  const hasChanges = (config: SchedulerConfig): boolean => {
    const edit = editStates[config.jobName];
    if (!edit) return false;
    const editMinute = parseInt(edit.minuteDisplay, 10);
    return edit.hour !== config.hour || editMinute !== config.minute || edit.timezone !== config.timezone;
  };

  const handleMinuteBlur = (jobName: string) => {
    setEditStates((prev) => {
      const current = prev[jobName];
      if (!current) return prev;
      const raw = current.minuteDisplay.trim();
      if (raw === "") {
        const config = configs.find((c) => c.jobName === jobName);
        const fallback = config ? String(config.minute).padStart(2, "0") : "00";
        return { ...prev, [jobName]: { ...current, minuteDisplay: fallback } };
      }
      if (/^\d{1,2}$/.test(raw)) {
        const num = parseInt(raw, 10);
        if (num >= 0 && num <= 59) {
          return { ...prev, [jobName]: { ...current, minuteDisplay: String(num).padStart(2, "0") } };
        }
      }
      return prev;
    });
  };

  const normalizeMinute = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!/^\d{1,2}$/.test(trimmed)) return null;
    const num = parseInt(trimmed, 10);
    if (num < 0 || num > 59) return null;
    return String(num).padStart(2, "0");
  };

  const handleSave = async (jobName: string) => {
    const edit = editStates[jobName];
    if (!edit) return;

    const normalized = normalizeMinute(edit.minuteDisplay);
    if (normalized === null) {
      toast({ title: "Invalid Minute", description: "Minute must be a two-digit value between 00 and 59.", variant: "destructive" });
      return;
    }

    setEditStates((prev) => ({
      ...prev,
      [jobName]: { ...prev[jobName], minuteDisplay: normalized },
    }));

    const minuteVal = parseInt(normalized, 10);

    setSavingJobs((prev) => ({ ...prev, [jobName]: true }));
    try {
      const { data: updated, warning } = await updateSchedulerConfig(jobName, edit.hour, minuteVal, edit.timezone);
      setConfigs((prev) => prev.map((c) => (c.jobName === jobName ? updated : c)));
      setEditStates((prev) => ({
        ...prev,
        [jobName]: { hour: updated.hour, minuteDisplay: String(updated.minute).padStart(2, "0"), timezone: updated.timezone },
      }));
      if (warning) {
        toast({ title: "Saved with warning", description: warning, variant: "destructive" });
      } else {
        toast({ title: "Saved", description: `Schedule for ${JOB_DISPLAY_NAMES[jobName] || jobName} updated successfully.` });
      }
    } catch {
      toast({ title: "Error", description: `Failed to update schedule for ${JOB_DISPLAY_NAMES[jobName] || jobName}.`, variant: "destructive" });
    } finally {
      setSavingJobs((prev) => ({ ...prev, [jobName]: false }));
    }
  };

  const handleTrigger = async (jobName: string) => {
    setTriggeringJobs((prev) => ({ ...prev, [jobName]: true }));
    setTriggerResults((prev) => {
      const copy = { ...prev };
      delete copy[jobName];
      return copy;
    });

    try {
      const result = await triggerSchedulerJob(jobName);
      setTriggerResults((prev) => ({
        ...prev,
        [jobName]: { success: result.success, message: result.message },
      }));
      if (result.success) {
        toast({ title: "Success", description: result.message });
      } else {
        toast({ title: "Job Failed", description: result.message, variant: "destructive" });
      }
      if (expandedLogs[jobName]) {
        loadLogs(jobName);
      }
    } catch {
      setTriggerResults((prev) => ({
        ...prev,
        [jobName]: { success: false, message: "Failed to trigger job." },
      }));
      toast({ title: "Error", description: `Failed to trigger ${JOB_DISPLAY_NAMES[jobName] || jobName}.`, variant: "destructive" });
    } finally {
      setTriggeringJobs((prev) => ({ ...prev, [jobName]: false }));
    }
  };

  const handleToggle = async (jobName: string, currentEnabled: boolean) => {
    setTogglingJobs((prev) => ({ ...prev, [jobName]: true }));
    try {
      const { data: updated, warning } = await toggleSchedulerJob(jobName, !currentEnabled);
      setConfigs((prev) => prev.map((c) => (c.jobName === jobName ? updated : c)));
      if (warning) {
        toast({ title: "Toggled with warning", description: warning, variant: "destructive" });
      } else {
        toast({ title: updated.isEnabled ? "Enabled" : "Disabled", description: `${JOB_DISPLAY_NAMES[jobName] || jobName} has been ${updated.isEnabled ? "enabled" : "disabled"}.` });
      }
    } catch {
      toast({ title: "Error", description: `Failed to toggle ${JOB_DISPLAY_NAMES[jobName] || jobName}.`, variant: "destructive" });
    } finally {
      setTogglingJobs((prev) => ({ ...prev, [jobName]: false }));
    }
  };

  const loadLogs = async (jobName: string) => {
    setLogsLoading((prev) => ({ ...prev, [jobName]: true }));
    try {
      const data = await fetchSchedulerLogs(jobName, 10);
      setJobLogs((prev) => ({ ...prev, [jobName]: data.logs }));
    } catch {
      toast({ title: "Error", description: `Failed to load logs for ${JOB_DISPLAY_NAMES[jobName] || jobName}.`, variant: "destructive" });
    } finally {
      setLogsLoading((prev) => ({ ...prev, [jobName]: false }));
    }
  };

  const openSentEmails = async (log: SchedulerLog, jobTimezone: string, jobName: string) => {
    setSentEmailsContext({
      startTime: log.startTime,
      endTime: log.endTime,
      timezone: log.timezone || jobTimezone,
      jobName,
    });
    setSentEmailsOpen(true);
    setSentEmails([]);
    setSentWelcomeEmails([]);
    setSentEmailsLoading(true);
    try {
      if (jobName === "WelcomeSeries") {
        const data = await fetchSentWelcomeEmails(log.startTime, log.endTime);
        setSentWelcomeEmails(data.emails);
      } else {
        const data = await fetchSentReminderEmails(log.startTime, log.endTime);
        setSentEmails(data.emails);
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load sent emails for this run.",
        variant: "destructive",
      });
    } finally {
      setSentEmailsLoading(false);
    }
  };

  const toggleLogs = (jobName: string) => {
    const isOpen = expandedLogs[jobName];
    setExpandedLogs((prev) => ({ ...prev, [jobName]: !isOpen }));
    if (!isOpen) {
      loadLogs(jobName);
    }
  };

  const formatTime = (hour: number, minute: number): string => {
    const period = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    return `${h}:${String(minute).padStart(2, "0")} ${period}`;
  };


  const formatDuration = (start: string, end: string): string => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSec = seconds % 60;
    return `${minutes}m ${remainingSec}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading scheduler configurations...</span>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No scheduler configurations found. The scheduler_configurations table may need to be initialized.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {configs.map((config) => {
        const edit = editStates[config.jobName];
        const isSaving = savingJobs[config.jobName];
        const isTriggering = triggeringJobs[config.jobName];
        const isToggling = togglingJobs[config.jobName];
        const result = triggerResults[config.jobName];
        const isExpanded = expandedLogs[config.jobName];
        const logs = jobLogs[config.jobName] || [];
        const isLogsLoading = logsLoading[config.jobName];
        const changed = hasChanges(config);

        return (
          <Card key={config.id}>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{JOB_DISPLAY_NAMES[config.jobName] || config.jobName}</h3>
                      {!config.isEnabled && (
                        <Badge variant="secondary" className="text-xs">Disabled</Badge>
                      )}
                    </div>
                    {(JOB_DESCRIPTIONS[config.jobName] || config.description) && (
                      <p className="text-sm text-muted-foreground mt-1">{JOB_DESCRIPTIONS[config.jobName] || config.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Currently scheduled: {formatTime(config.hour, config.minute)} ({config.timezone})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        {config.isEnabled ? "Enabled" : "Disabled"}
                      </label>
                      <Switch
                        checked={config.isEnabled}
                        onCheckedChange={() => handleToggle(config.jobName, config.isEnabled)}
                        disabled={isToggling}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTrigger(config.jobName)}
                      disabled={isTriggering || !config.isEnabled}
                    >
                      {isTriggering ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Run Now
                    </Button>
                  </div>
                </div>

                {result && (
                  <div
                    className={`flex items-start gap-2 p-3 rounded-md text-sm ${
                      result.success
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <span>{result.message}</span>
                  </div>
                )}

                {edit && (
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Hour (0-23)</label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={edit.hour}
                        onChange={(e) => handleEditChange(config.jobName, "hour", parseInt(e.target.value, 10) || 0)}
                        className="w-20"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Minute (00-59)</label>
                      <Input
                        type="text"
                        maxLength={2}
                        value={edit.minuteDisplay}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                          if (v.length === 2 && parseInt(v, 10) > 59) return;
                          handleEditChange(config.jobName, "minuteDisplay", v);
                        }}
                        onBlur={() => handleMinuteBlur(config.jobName)}
                        className="w-20"
                      />
                      {edit.minuteDisplay.trim() !== "" && normalizeMinute(edit.minuteDisplay) === null && (
                        <span className="text-xs text-red-500">Must be 00–59</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Timezone</label>
                      <Select
                        value={edit.timezone}
                        onValueChange={(v) => handleEditChange(config.jobName, "timezone", v)}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSave(config.jobName)}
                      disabled={isSaving || !changed}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save
                    </Button>
                  </div>
                )}

                <Collapsible open={isExpanded} onOpenChange={() => toggleLogs(config.jobName)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-fit">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      )}
                      Recent Logs
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    {isLogsLoading ? (
                      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading logs...
                      </div>
                    ) : logs.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">No recent logs found.</p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>Start Time</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Details</TableHead>
                              {(config.jobName === "SendReminderEmail" ||
                                config.jobName === "WelcomeSeries") && (
                                <TableHead>Action</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {logs.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell>
                                  {(log.status === "Failed" || (!log.status && log.errorMessage)) ? (
                                    <Badge variant="destructive">Failed</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-green-100 text-green-800">Success</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{formatDateTimeInZone(log.startTime, log.timezone || config.timezone)}</TableCell>
                                <TableCell className="text-sm">{formatDuration(log.startTime, log.endTime)}</TableCell>
                                <TableCell className="text-sm max-w-md truncate">
                                  {log.errorMessage ? (
                                    <span className="text-red-600" title={log.errorMessage}>
                                      {log.errorMessage}
                                    </span>
                                  ) : config.jobName === "SendReminderEmail" ? (
                                    <span>Day3: {log.day3EmailCount}, Week2: {log.week2EmailCount}</span>
                                  ) : config.jobName === "WelcomeSeries" ? (
                                    (() => {
                                      const md = (log.metadata as Record<string, unknown> | null) || {};
                                      const day1 = Number(md.day1 ?? 0);
                                      const day6 = Number(md.day6 ?? 0);
                                      const day10 = Number(md.day10 ?? 0);
                                      return (
                                        <span>
                                          Day1: {day1}, Day6: {day6}, Day10: {day10}
                                        </span>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-muted-foreground">Completed</span>
                                  )}
                                </TableCell>
                                {(config.jobName === "SendReminderEmail" ||
                                  config.jobName === "WelcomeSeries") && (
                                  <TableCell>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openSentEmails(log, config.timezone, config.jobName)}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      View
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={sentEmailsOpen} onOpenChange={setSentEmailsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {sentEmailsContext?.jobName === "WelcomeSeries"
                ? "Welcome Series Emails Sent"
                : "Reminder Emails Sent"}
              {sentEmailsContext && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · Run started {formatDateTimeInZone(sentEmailsContext.startTime, sentEmailsContext.timezone)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {sentEmailsLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sent emails...
            </div>
          ) : sentEmailsContext?.jobName === "WelcomeSeries" ? (
            <Tabs defaultValue="1" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="self-start">
                {([1, 6, 10] as const).map((dayOffset) => {
                  const count = sentWelcomeEmails.filter((e) => e.dayOffset === dayOffset).length;
                  return (
                    <TabsTrigger key={dayOffset} value={String(dayOffset)}>
                      Day {dayOffset} ({count})
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {([1, 6, 10] as const).map((dayOffset) => {
                const filtered = sentWelcomeEmails.filter((e) => e.dayOffset === dayOffset);
                return (
                  <TabsContent key={dayOffset} value={String(dayOffset)} className="flex-1 overflow-auto mt-4">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No Day {dayOffset} welcome emails were sent during this run.
                      </p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>Sent At</TableHead>
                              <TableHead>Recipient</TableHead>
                              <TableHead>Error</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filtered.map((email) => {
                              const fullName = [email.userFirstName, email.userLastName]
                                .filter(Boolean)
                                .join(" ");
                              const failed = !email.success || !!email.errorMessage;
                              return (
                                <TableRow key={email.id}>
                                  <TableCell>
                                    {failed ? (
                                      <Badge variant="destructive">Failed</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        Sent
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm whitespace-nowrap">
                                    {formatDateTimeInZone(
                                      email.sentDate,
                                      sentEmailsContext?.timezone || "UTC"
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <div>{email.userEmail || "—"}</div>
                                    {fullName && (
                                      <div className="text-xs text-muted-foreground">{fullName}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm max-w-xs truncate">
                                    {email.errorMessage ? (
                                      <span className="text-red-600" title={email.errorMessage}>
                                        {email.errorMessage}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          ) : (
            <Tabs defaultValue="Day3" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="self-start">
                {(["Day3", "Week2"] as const).map((type) => {
                  const count = sentEmails.filter((e) => e.reminderType === type).length;
                  const label = type === "Day3" ? "Day 3" : "Day 14";
                  return (
                    <TabsTrigger key={type} value={type}>
                      {label} ({count})
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {(["Day3", "Week2"] as const).map((type) => {
                const filtered = sentEmails.filter((e) => e.reminderType === type);
                const label = type === "Day3" ? "Day 3" : "Day 14";
                return (
                  <TabsContent key={type} value={type} className="flex-1 overflow-auto mt-4">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No {label} reminder emails were sent during this run.
                      </p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>Sent At</TableHead>
                              <TableHead>Recipient</TableHead>
                              <TableHead>Investment</TableHead>
                              <TableHead>DAF Provider</TableHead>
                              <TableHead>Error</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filtered.map((email) => {
                              const fullName = [email.userFirstName, email.userLastName]
                                .filter(Boolean)
                                .join(" ");
                              return (
                                <TableRow key={email.id}>
                                  <TableCell>
                                    {email.errorMessage ? (
                                      <Badge variant="destructive">Failed</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        Sent
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm whitespace-nowrap">
                                    {formatDateTimeInZone(
                                      email.sentDate,
                                      sentEmailsContext?.timezone || "UTC"
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <div>{email.userEmail || "—"}</div>
                                    {fullName && (
                                      <div className="text-xs text-muted-foreground">{fullName}</div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm">{email.campaignName || "—"}</TableCell>
                                  <TableCell className="text-sm">{email.dafProvider || "—"}</TableCell>
                                  <TableCell className="text-sm max-w-xs truncate">
                                    {email.errorMessage ? (
                                      <span className="text-red-600" title={email.errorMessage}>
                                        {email.errorMessage}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
