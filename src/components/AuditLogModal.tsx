import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetchAuditLogs, AuditLogEntry } from "../api/home/homeApi";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/helpers/format";
import { Loader2, History } from "lucide-react";

interface AuditLogModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityType: string;
  title?: string;
}

const SYSTEM_FIELDS = ["modifieddate", "modifiedat", "lastmodified", "createddate", "modifiedby"];

function stripHtml(value: string): string {
  if (!value || typeof value !== "string") return value;
  if (!/<[^>]+>/.test(value) && !/&[a-zA-Z]+;/.test(value) && !/&#\d+;/.test(value)) return value;
  let result = value.replace(/<(b|strong)>\s*(.*?)\s*<\/\1>/gi, "@$2");
  result = result.replace(/<[^>]+>/g, "");
  const doc = new DOMParser().parseFromString(result, "text/html");
  result = doc.documentElement.textContent || result;
  return result.trim();
}

function formatFieldLabel(field: string): string {
  let label = field.replace(/_/g, " ");
  label = label.replace(/([a-z])([A-Z])/g, "$1 $2");
  label = label
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return label;
}

function isDateString(val: any): boolean {
  if (typeof val !== "string") return false;
  if (val.length < 8 || val.length > 30) return false;
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
  ];
  return datePatterns.some((p) => p.test(val));
}

function formatDateValue(val: string): string {
  return formatDateTime(val, val);
}

function isCreatedAction(actionType: string | null): boolean {
  if (!actionType) return false;
  const lower = actionType.toLowerCase();
  return lower === "created" || lower === "added";
}

function isDeletedAction(actionType: string | null): boolean {
  if (!actionType) return false;
  return actionType.toLowerCase() === "deleted";
}

export function AuditLogModal({ isOpen, onOpenChange, entityId, entityType, title = "Audit Logs" }: AuditLogModalProps) {
  const {
    data: queryData,
    isLoading,
    error
  } = useQuery({
    queryKey: ["audit-logs", entityId, entityType],
    queryFn: () =>
      fetchAuditLogs({
        id: entityId,
        type: entityType,
        PerPage: 100
      }),
    enabled: isOpen && !!entityId && !!entityType,
  });

  const logs = queryData?.items ?? [];

  const getEntityLabel = (tableName?: string) => {
    const source = tableName || entityType;
    const labelMap: Record<string, string> = {
      Campaigns: "Investment",
      campaigns: "Investment",
      Groups: "Group",
      groups: "Group",
      AspNetUsers: "User",
      users: "User",
    };

    if (labelMap[source]) return labelMap[source];

    const singular = source.endsWith("s") ? source.slice(0, -1) : source;
    return singular.replace(/([a-z])([A-Z])/g, "$1 $2");
  };

  const getActionLabel = (log: AuditLogEntry) => {
    const entityLabel = getEntityLabel(log.tableName);

    if (!log.actionType) return `${entityLabel} updated`;
    if (log.actionType === "Modified") return `${entityLabel} updated`;
    if (isCreatedAction(log.actionType)) return `${entityLabel} created`;
    if (isDeletedAction(log.actionType)) return `${entityLabel} deleted`;

    return `${entityLabel} ${log.actionType.toLowerCase()}`;
  };

  const parseJson = (str: string | null) => {
    if (!str) return {};
    try {
      return JSON.parse(str) ?? {};
    } catch {
      return {};
    }
  };

  const parseChangedColumns = (cols: string | null): string[] => {
    try {
      if (!cols) return [];
      const parsed = JSON.parse(cols);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item: any) => {
          if (!item) return null;
          if (typeof item === "string") return item;
          if (typeof item === "object" && item.name) return item.name;
          return null;
        })
        .filter((x: any): x is string => !!x);
    } catch {
      return [];
    }
  };

  const normalize = (val: any) => {
    if (val === null || val === undefined || val === "") return null;
    return val;
  };

  const renderChanges = (log: AuditLogEntry) => {
    const oldVals = parseJson(log.oldValues) || {};
    const newVals = parseJson(log.newValues) || {};
    let changedFields = parseChangedColumns(log.changedColumns);

    if (isCreatedAction(log.actionType)) {
      let recordName = log.identifier;
      if (!recordName) {
        const vals = parseJson(log.newValues || "");
        recordName = vals?.Name || vals?.name || vals?.Title || vals?.title || vals?.FirstName || vals?.firstName || null;
      }
      const label = recordName ? `${recordName} Created` : "Record Created";
      return <span className="text-[#0ab39c] text-[11px] font-semibold uppercase tracking-wider bg-[#0ab39c]/10 px-2 py-0.5 rounded">{label}</span>;
    }

    if (changedFields.length === 0) {
      if (isDeletedAction(log.actionType) && Object.keys(oldVals).length > 0) {
        changedFields = Object.keys(oldVals);
      }
    }

    const filteredFields = changedFields.filter((field) => {
      if (!field) return false;

      if (SYSTEM_FIELDS.includes(field.toLowerCase())) return false;

      const oldVal = normalize(oldVals[field]);
      const newVal = normalize(newVals[field]);

      return JSON.stringify(oldVal) !== JSON.stringify(newVal);
    });

    if (filteredFields.length === 0) {
      if (isDeletedAction(log.actionType)) {
        return <span className="text-[#f06548] italic text-[11px] font-semibold uppercase tracking-wider bg-[#f06548]/10 px-2 py-0.5 rounded">Record Deleted</span>;
      }
      return <span className="text-muted-foreground italic text-xs">No user-facing changes (system update)</span>;
    }

    return (
      <div className="space-y-1.5 py-1">
        {filteredFields.map((field) => {
          const oldVal = oldVals[field];
          const newVal = newVals[field];

          const formatVal = (val: any) => {
            const normalized = normalize(val);
            if (normalized === null) {
              return <span className="text-xs italic opacity-40 px-1 select-none">empty</span>;
            }
            if (typeof val === "boolean") return val ? "True" : "False";
            if (typeof val === "object") return JSON.stringify(val);
            let strVal = String(val);
            if (isDateString(strVal)) {
              strVal = formatDateValue(strVal);
            }
            strVal = stripHtml(strVal);
            return strVal;
          };

          return (
            <div key={field} className="text-[13px] leading-relaxed group flex items-start">
              <span className="font-semibold text-muted-foreground mr-2 min-w-[120px] shrink-0">
                {formatFieldLabel(field)}:
              </span>
              <div className="flex items-center flex-wrap gap-x-2">
                <span className="text-[#f06548] font-medium bg-[#f06548]/5 px-1.5 py-0.5 rounded border border-[#f06548]/10 break-all">{formatVal(oldVal)}</span>
                <span className="text-muted-foreground/40 font-bold shrink-0">→</span>
                <span className="text-[#45cb85] font-medium bg-[#45cb85]/5 px-1.5 py-0.5 rounded border border-[#45cb85]/10 break-all">{formatVal(newVal)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-[1200px] max-h-[90vh] min-h-[400px] flex flex-col p-0 overflow-hidden transition-all duration-300">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            View audit log history for this record
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-[#405189] opacity-80" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Retrieving history...</p>
                <p className="text-[11px] text-muted-foreground/60">Scanning investment records</p>
              </div>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <div className="bg-red-50 text-red-600 p-4 rounded-lg inline-block text-sm font-medium border border-red-100 italic">
                Failed to load audit logs. Please try again.
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20 text-center animate-in fade-in zoom-in duration-300">
              <div className="h-20 w-20 bg-muted/20 rounded-full flex items-center justify-center mb-2">
                <History className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-bold text-muted-foreground/80 tracking-tight">No History Recorded</p>
                <p className="text-sm text-muted-foreground/60 max-w-[280px]">
                  We couldn't find any modification logs for this record.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] text-muted-foreground uppercase bg-[#f3f6f9] sticky top-0 z-10 border-b border-border font-bold">
                  <tr>
                    <th className="px-6 py-3 whitespace-nowrap">Action</th>
                    <th className="px-6 py-3 whitespace-nowrap">Changed By</th>
                    <th className="px-6 py-3">Changes</th>
                    <th className="px-6 py-3 whitespace-nowrap">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff2f7]">
                  {logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-[#f3f6f9] transition-colors bg-white">
                      <td className="px-6 py-4 align-top w-[1px]">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold tracking-wide whitespace-nowrap ${isCreatedAction(log.actionType) ? "bg-[#F06548] text-white" :
                          log.actionType === "Modified" || !log.actionType ? "bg-[#4b38b3] text-white" :
                            "bg-[#f06548] text-white"
                          }`}>
                          {getActionLabel(log)}
                        </span>
                      </td>
                      <td className="px-6 py-4 align-top whitespace-nowrap">
                        <span className="text-sm font-medium text-[#495057]">{log.updatedBy || "admin1"}</span>
                      </td>
                      <td className="px-6 py-4 align-top">
                        {renderChanges(log)}
                      </td>
                      <td className="px-6 py-4 align-top whitespace-nowrap text-[13px] text-muted-foreground font-medium">
                        {formatDateTime(log.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
