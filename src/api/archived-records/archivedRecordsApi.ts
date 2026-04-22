import axiosInstance from "../axios";

export interface ArchivedRecordsSummary {
  totalDeleted: number;
  accountBalanceLogs: number;
  campaigns: number;
  completedInvestments: number;
  disbursals: number;
  emailTemplates: number;
  events: number;
  faqs: number;
  formSubmissions: number;
  groups: number;
  news: number;
  pendingGrants: number;
  recommendations: number;
  returnDetails: number;
  testimonials: number;
  users: number;
}

export interface ArchivedItem {
  id: number;
  name: string;
  deletedAt: string;
  type: string;
}

export interface ArchivedItemsResponse {
  items: ArchivedItem[];
  totalRecords: number;
}

export interface ArchivedRecordsParams {
  currentPage?: number;
  perPage?: number;
  searchValue?: string;
  type: string;
}

export const fetchArchivedRecordsSummary = async (): Promise<ArchivedRecordsSummary> => {
  const response = await axiosInstance.get("/api/admin/recycle-bin/summary");
  if (response.data.success) {
      return response.data.data;
  }
  return response.data;
};

export const fetchArchivedItems = async (params: ArchivedRecordsParams): Promise<ArchivedItemsResponse> => {
  const queryParams: Record<string, string> = { type: params.type };
  if (params.currentPage) queryParams.CurrentPage = params.currentPage.toString();
  if (params.perPage) queryParams.PerPage = params.perPage.toString();
  if (params.searchValue) queryParams.SearchValue = params.searchValue;

  const response = await axiosInstance.get("/api/admin/recycle-bin/list", { params: queryParams });
  if (response.data.success) {
      return response.data.data;
  }
  return response.data;
};

const MODULE_API_MAP: Record<string, string> = {
  faqs: "faq",
  campaigns: "investment",
  accountBalanceLogs: "transaction-history",
  users: "user",
  groups: "group",
  news: "news",
  emailTemplates: "email-template",
  events: "event",
  testimonials: "testimonial",
  teams: "team",
  formSubmissions: "form-submission",
  completedInvestments: "completed-investment",
  disbursals: "disbursal-request",
  pendingGrants: "pending-grant",
  recommendations: "recommendation",
  returnDetails: "investment-return",
  assetRequests: "other-asset",
};

export const restoreArchivedItem = async (type: string, id: number | string): Promise<{ success: boolean; message: string }> => {
  const module = MODULE_API_MAP[type] || type;
  const response = await axiosInstance.put(`/api/admin/${module}/restore`, [id]);
  return response.data;
};

export const restoreBatchArchivedItems = async (type: string, ids: (number | string)[]): Promise<{ success: boolean; message: string }> => {
  const module = MODULE_API_MAP[type] || type;
  const response = await axiosInstance.put(`/api/admin/${module}/restore`, ids);
  return response.data;
};
