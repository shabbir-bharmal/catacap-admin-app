import axiosInstance from "../axios";

export interface SchedulerConfig {
  id: number;
  jobName: string;
  description: string | null;
  hour: number;
  minute: number;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerLog {
  id: number;
  jobName: string;
  startTime: string;
  endTime: string;
  day3EmailCount: number;
  week2EmailCount: number;
  errorMessage: string | null;
}

export interface SchedulerLogsResponse {
  logs: SchedulerLog[];
  total: number;
}

export interface TriggerResult {
  success: boolean;
  message: string;
  error?: string;
  startTime: string;
  endTime: string;
}

export async function fetchSchedulerConfigs(): Promise<SchedulerConfig[]> {
  const response = await axiosInstance.get<SchedulerConfig[]>(
    "/api/admin/scheduler"
  );
  const data = response.data;
  if (!Array.isArray(data)) return [];
  return data;
}

export interface UpdateSchedulerResult {
  data: SchedulerConfig;
  warning?: string;
}

export async function updateSchedulerConfig(
  jobName: string,
  hour: number,
  minute: number,
  timezone: string
): Promise<UpdateSchedulerResult> {
  const response = await axiosInstance.put<{ success: boolean; data: SchedulerConfig; warning?: string }>(
    `/api/admin/scheduler/${jobName}`,
    { hour, minute, timezone }
  );
  return { data: response.data.data, warning: response.data.warning };
}

export async function triggerSchedulerJob(
  jobName: string
): Promise<TriggerResult> {
  const response = await axiosInstance.post<TriggerResult>(
    `/api/admin/scheduler/${jobName}/trigger`
  );
  return response.data;
}

export async function fetchSchedulerLogs(
  jobName?: string,
  limit = 20,
  offset = 0
): Promise<SchedulerLogsResponse> {
  const params: Record<string, string | number> = { limit, offset };
  if (jobName) params.jobName = jobName;
  const response = await axiosInstance.get<SchedulerLogsResponse>(
    "/api/admin/scheduler/logs",
    { params }
  );
  return response.data;
}
