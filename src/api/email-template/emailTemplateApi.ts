import axiosInstance from "../axios";

export const EmailTemplateCategoryEnum = {
  WelcomeAnonymous:    1,
  WelcomeRegistered:   2,
  InvestmentUnderReview: 3,
  InvestmentApproved:  4,
  PasswordReset:       5,
  SystemNotification:  6,
} as const;
export type EmailTemplateCategoryValue = typeof EmailTemplateCategoryEnum[keyof typeof EmailTemplateCategoryEnum];

export const EmailTemplateStatusEnum = {
  Draft:    1,
  Active:   2,
  Inactive: 3,
} as const;
export type EmailTemplateStatusValue = typeof EmailTemplateStatusEnum[keyof typeof EmailTemplateStatusEnum];

export const EMAIL_TEMPLATE_STATUS_LABELS: Record<EmailTemplateStatusValue, string> = {
  [EmailTemplateStatusEnum.Draft]:    "Draft",
  [EmailTemplateStatusEnum.Active]:   "Active",
  [EmailTemplateStatusEnum.Inactive]: "Inactive",
};

export interface EmailTemplateCategory {
  id: number;
  name: string;
  label: string;
}

export interface EmailTemplateListItem {
  id: number;
  name: string;
  subject: string;
  bodyHtml: string | null;
  category: number;
  categoryName: string;
  status: number;
  statusName: string;
  receiver: string | null;
  triggerAction: string | null;
  modifiedAt: string | null;
}

export interface EmailTemplateDetail {
  id: number;
  name: string;
  subject: string;
  bodyHtml: string;
  category: number;
  categoryName: string;
  status: number;
  statusName: string;
  receiver: string | null;
  triggerAction: string | null;
  modifiedAt: string | null;
}

export interface EmailTemplateListResponse {
  totalRecords: number;
  items: EmailTemplateListItem[];
}

export interface EmailTemplatePreview {
  name: string;
  subject: string;
  bodyHtml: string;
}

export interface EmailTemplateDuplicate {
  name: string;
  subject: string;
  bodyHtml: string;
  category: number;
  categoryName: string;
  status: number;
  statusName: string;
  receiver: string | null;
  triggerAction: string | null;
}

export interface CreateEmailTemplatePayload {
  name: string;
  subject: string;
  bodyHtml: string;
  category: number;
  status: number;
  receiver: string;
  triggerAction: string;
}

export interface UpdateEmailTemplatePayload extends CreateEmailTemplatePayload {
  id: number;
}

export interface EmailTemplateListParams {
  currentPage?: number;
  perPage?: number;
  sortField?: string;
  sortDirection?: string;
  searchValue?: string;
  status?: string;
  category?: string;
  isDeleted?: boolean;
}

export async function fetchEmailTemplates(
  params: EmailTemplateListParams = {}
): Promise<EmailTemplateListResponse> {
  const queryParams: Record<string, string> = {};

  if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
  if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
  if (params.sortField) queryParams.SortField = params.sortField;
  if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
  if (params.searchValue) queryParams.SearchValue = params.searchValue;
  if (params.status) queryParams.Status = params.status;
  if (params.category) queryParams.Category = params.category;
  if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();

  const response = await axiosInstance.get<EmailTemplateListResponse>("/api/admin/email-template", { 
    params: queryParams 
  });
  return response.data;
}

export async function fetchEmailTemplateById(id: number): Promise<EmailTemplateDetail> {
  const response = await axiosInstance.get<EmailTemplateDetail>(`/api/admin/email-template/${id}`);
  return response.data;
}

export async function fetchEmailTemplatePreview(id: number): Promise<EmailTemplatePreview> {
  const response = await axiosInstance.get<EmailTemplatePreview>(`/api/admin/email-template/preview/${id}`);
  return response.data;
}

export async function fetchEmailTemplateHtml(id: number): Promise<string> {
  const response = await axiosInstance.get<string>(`/api/admin/email-template/html/${id}`);
  return response.data;
}

export async function fetchEmailTemplateDuplicate(id: number): Promise<EmailTemplateDuplicate> {
  const response = await axiosInstance.get<EmailTemplateDuplicate>(`/api/admin/email-template/duplicate/${id}`);
  return response.data;
}

export async function fetchEmailTemplateCategories(): Promise<EmailTemplateCategory[]> {
  const response = await axiosInstance.get<EmailTemplateCategory[]>("/api/admin/email-template/categories");
  return response.data;
}

export async function createEmailTemplate(payload: CreateEmailTemplatePayload): Promise<unknown> {
  const response = await axiosInstance.post("/api/admin/email-template", payload);
  return response.data;
}

export async function updateEmailTemplate(payload: UpdateEmailTemplatePayload): Promise<unknown> {
  const response = await axiosInstance.post("/api/admin/email-template", payload);
  return response.data;
}

export async function deleteEmailTemplate(id: number): Promise<unknown> {
  const response = await axiosInstance.delete(`/api/admin/email-template/${id}`);
  return response.data;
}

export async function sendTestEmail(id: number, email: string): Promise<{ success: boolean; message: string }> {
  const response = await axiosInstance.post<{ success: boolean; message: string }>(`/api/admin/email-template/send-test/${id}`, { email });
  return response.data;
}
