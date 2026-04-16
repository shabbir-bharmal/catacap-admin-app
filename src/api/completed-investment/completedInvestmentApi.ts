import axiosInstance from "../axios";

export interface CompletedInvestmentEntry {
  id: number;
  dateOfLastInvestment: string;
  name: string;
  stage: string;
  cataCapFund: string | null;
  investmentDetail: string;
  totalInvestmentAmount: number;
  typeOfInvestment: string;
  donors: number;
  themes: string;
  hasNotes: boolean;
  transactionType: number | null;
  transactionTypeValue: string | null;
  property: string;
  balanceSheet?: string | null;
}

export interface CompletedInvestmentParams {
  currentPage?: number;
  perPage?: number;
  sortField?: string;
  sortDirection?: string;
  isDeleted?: boolean;
  searchValue?: string;
}

export interface PaginatedCompletedInvestmentResponse {
  totalCount: number;
  items: CompletedInvestmentEntry[];
  completedInvestments: number;
  totalInvestmentAmount: number;
  totalInvestors: number;
  lastCompletedInvestmentsDate: string;
}

export async function fetchCompletedInvestments(
  params?: CompletedInvestmentParams
): Promise<PaginatedCompletedInvestmentResponse> {
  const queryParams: Record<string, string> = {};

  if (params) {
    if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
    if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
    if (params.sortField) queryParams.SortField = params.sortField;
    if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
    if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();
    if (params.searchValue !== undefined && params.searchValue !== null && params.searchValue !== "") queryParams.SearchValue = params.searchValue;
  }

  const response = await axiosInstance.get<PaginatedCompletedInvestmentResponse>(
    "/api/admin/completed-investment",
    { params: queryParams }
  );

  return response.data;
}

export async function exportCompletedInvestments(): Promise<void> {
  const response = await axiosInstance.get("/api/admin/completed-investment/export", {
    responseType: "blob",
  });

  const blob = new Blob([response.data]);
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  link.setAttribute("download", `Completed Investments_${dateStr}.xlsx`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export interface CompletedInvestmentNoteEntry {
  id: number;
  createdAt: string;
  userName: string;
  transactionType: number | string;
  oldAmount: number | null;
  newAmount: number | null;
  note: string;
}

export async function fetchCompletedInvestmentNotes(
  id: number
): Promise<CompletedInvestmentNoteEntry[]> {
  const response = await axiosInstance.get<CompletedInvestmentNoteEntry[]>(
    `/api/admin/completed-investment/${id}/notes`
  );
  return response.data;
}

export interface UpdateNotePayload {
  completedInvestmentNoteId: number;
  transactionTypeId: number;
  note: string;
  amount?: number;
}

export async function updateCompletedInvestmentNote(
  payload: UpdateNotePayload
): Promise<{ success: boolean; message?: string }> {
  const response = await axiosInstance.put(
    `/api/admin/completed-investment/notes/${payload.completedInvestmentNoteId}`,
    payload
  );
  return response.data;
}

export interface UpdateCompletedInvestmentParams {
  Id: number;
  InvestmentId: number;
  InvestmentDetail: string;
  TotalInvestmentAmount: number;
  TransactionTypeId: number;
  DateOfLastInvestment: string;
  TypeOfInvestmentIds: string;
  TypeOfInvestmentName: string;
  Note: string;
  BalanceSheet: string;
}

export async function updateCompletedInvestmentDetails(
  params: UpdateCompletedInvestmentParams
): Promise<void> {
  await axiosInstance.post("/api/admin/completed-investment", {
    id: params.Id,
    investmentId: params.InvestmentId,
    investmentDetail: params.InvestmentDetail,
    totalInvestmentAmount: params.TotalInvestmentAmount,
    transactionTypeId: params.TransactionTypeId,
    dateOfLastInvestment: params.DateOfLastInvestment,
    typeOfInvestmentIds: params.TypeOfInvestmentIds,
    typeOfInvestmentName: params.TypeOfInvestmentName,
    note: params.Note,
    balanceSheet: params.BalanceSheet,
  });
}

export interface CreateCompletedInvestmentPayload {
  id?: number;
  investmentId: number;
  investmentDetail: string;
  totalInvestmentAmount?: number;
  transactionTypeId: number;
  dateOfLastInvestment?: string;
  typeOfInvestmentIds: string;
  typeOfInvestmentName?: string;
  note?: string;
  balanceSheet: string;
}

export async function createCompletedInvestment(
  payload: CreateCompletedInvestmentPayload
): Promise<void> {
  await axiosInstance.post("/api/admin/completed-investment", payload);
}

export interface CompletedInvestmentDetailsResponse {
  dateOfLastInvestment?: string;
  typeOfInvestmentIds?: string;
  pendingRecommendationsAmount?: number;
  approvedRecommendationsAmount?: number;
  balanceSheet?: string | null;
}

export async function fetchCompletedInvestmentDetailsByInvestment(
  investmentId: number
): Promise<CompletedInvestmentDetailsResponse> {
  const response = await axiosInstance.get<CompletedInvestmentDetailsResponse>(
    "/api/admin/completed-investment/details",
    { params: { investmentId } }
  );
  return response.data;
}

export interface SiteConfigOption {
  id: number;
  value: string;
}

export async function fetchTransactionTypes(type: string): Promise<SiteConfigOption[]> {
  const response = await axiosInstance.get<SiteConfigOption[]>(
    `/api/admin/site-configuration/${type}`
  );
  return response.data;
}

export interface InvestmentTypeOption {
  id: number;
  name: string;
}

export async function fetchInvestmentTypes(): Promise<InvestmentTypeOption[]> {
  const response = await axiosInstance.get<InvestmentTypeOption[]>(
    "/api/admin/investment/types"
  );
  return response.data;
}

export interface InvestmentNameOption {
  id: number;
  name: string;
}

export async function fetchInvestmentNames(stage: number = 10): Promise<InvestmentNameOption[]> {
  const response = await axiosInstance.get<InvestmentNameOption[]>(
    "/api/admin/investment/names",
    { params: { stage } }
  );
  return response.data;
}

export async function deleteCompletedInvestment(id: number): Promise<any> {
  const response = await axiosInstance.delete(`/api/admin/completed-investment/${id}`);
  return response.data;
}
