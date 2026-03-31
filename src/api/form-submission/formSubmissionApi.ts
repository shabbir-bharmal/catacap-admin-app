import axiosInstance from "../axios";

export enum FormType {
  Companies = 1,
  Home = 2,
  ChampionDeal = 3,
  About = 4,
  Group = 5
}

export interface FormSubmission {
  id: number;
  formType: number;
  firstName: string;
  lastName: string;
  email: string;
  description: string;
  status: number;
  launchPartners: string | null;
  targetRaiseAmount: number | null;
  selfRaiseAmountRange: string | null;
  note: string | null;
  modifiedBy: string;
  modifiedByUser: string | null;
  createdAt: string;
  modifiedAt: string;
  isDeleted: boolean;
}

export interface FormSubmissionParams {
  currentPage?: number;
  perPage?: number;
  sortField?: string;
  sortDirection?: string;
  searchValue?: string;
  formType?: string;
  isDeleted?: boolean;
}

export interface PaginatedFormSubmissionResponse {
  items: FormSubmission[];
  totalCount: number;
}

export async function fetchFormSubmissions(
  params?: FormSubmissionParams
): Promise<PaginatedFormSubmissionResponse> {
  const queryParams: Record<string, string> = {
    CurrentPage: (params?.currentPage || 1).toString(),
    PerPage: (params?.perPage || 25).toString(),
  };

  if (params?.sortField) queryParams.SortField = params.sortField;
  if (params?.sortDirection) queryParams.SortDirection = params.sortDirection;
  if (params?.searchValue) queryParams.SearchValue = params.searchValue;
  if (params?.formType) queryParams.FormType = params.formType;
  if (params?.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();

  const response = await axiosInstance.get<PaginatedFormSubmissionResponse>(
    "/api/admin/form-submission",
    { params: queryParams }
  );

  return response.data;
}

export async function fetchFormSubmissionDetails(id: number): Promise<FormSubmission> {
  const response = await axiosInstance.get<FormSubmission>(
    `/api/admin/form-submission/${id}`
  );
  return response.data;
}

export async function updateFormSubmissionStatus(id: number, status: number, note: string): Promise<void> {
  await axiosInstance.put(`/api/admin/form-submission`, { id, status, note });
}

export async function deleteFormSubmission(id: number): Promise<{ success: boolean; message: string }> {
  const response = await axiosInstance.delete<{ success: boolean; message: string }>(
    `/api/admin/form-submission/${id}`
  );
  return response.data;
}
export async function fetchFormSubmissionNotes(id: number): Promise<any[]> {
  const response = await axiosInstance.get<any[]>(
    `/api/admin/form-submission/${id}/notes`
  );
  return response.data;
}
