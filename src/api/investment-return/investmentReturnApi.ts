import axiosInstance from "../axios";

export interface InvestmentReturnParams {
  currentPage?: number;
  perPage?: number;
  isDeleted?: boolean;
  searchValue?: string;
}

export interface InvestmentReturnEntry {
  investmentName: string;
  firstName: string;
  lastName: string;
  email: string;
  investmentAmount: number;
  percentage: number;
  returnedAmount: number;
  memo: string;
  status: string;
  privateDebtDates: string;
  postDate: string;
}

export interface PaginatedInvestmentReturnResponse {
  items: InvestmentReturnEntry[];
  totalCount: number;
}

export interface CalculateInvestmentReturnParams {
  investmentId: number;
  returnAmount: number;
  memoNote: string;
  currentPage: number;
  perPage: number;
  privateDebtStartDate: string | null;
  privateDebtEndDate: string | null;
}

export interface CreateInvestmentReturnPayload {
  investmentId: number;
  returnAmount: number;
  memoNote: string;
  privateDebtStartDate: string | null;
  privateDebtEndDate: string | null;
}

export interface CalculateInvestmentReturnStatusResponse {
  success: boolean;
  message?: string;
  items?: InvestmentReturnEntry[];
  totalCount?: number;
}

export type CalculateInvestmentReturnResponse =
  | PaginatedInvestmentReturnResponse
  | InvestmentReturnEntry[]
  | CalculateInvestmentReturnStatusResponse
  | null;

export interface CreateInvestmentReturnResponse {
  success: boolean;
  message?: string;
}

export async function fetchInvestmentReturns(
  params?: InvestmentReturnParams
): Promise<PaginatedInvestmentReturnResponse> {
  const queryParams: Record<string, string> = {};

  if (params) {
    if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
    if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
    if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();
    if (params.searchValue !== undefined && params.searchValue !== null) queryParams.SearchValue = params.searchValue;
  }

  const response = await axiosInstance.get<PaginatedInvestmentReturnResponse>(
    "/api/admin/investment-return",
    { params: queryParams }
  );

  return response.data;
}

export async function calculateInvestmentReturn(
  params: CalculateInvestmentReturnParams
): Promise<CalculateInvestmentReturnResponse> {
  const queryParams: Record<string, string> = {
    InvestmentId: params.investmentId.toString(),
    ReturnAmount: params.returnAmount.toString(),
    MemoNote: params.memoNote,
    CurrentPage: params.currentPage.toString(),
    PerPage: params.perPage.toString(),
  };

  if (params.privateDebtStartDate) {
    queryParams.PrivateDebtStartDate = params.privateDebtStartDate;
  }

  if (params.privateDebtEndDate) {
    queryParams.PrivateDebtEndDate = params.privateDebtEndDate;
  }

  const response = await axiosInstance.get<CalculateInvestmentReturnResponse>(
    "/api/admin/investment-return/calculate",
    {
      params: queryParams,
    }
  );
  return response.data;
}

export async function createInvestmentReturn(
  payload: CreateInvestmentReturnPayload
): Promise<CreateInvestmentReturnResponse> {
  const response = await axiosInstance.post<CreateInvestmentReturnResponse>(
    "/api/admin/investment-return",
    payload
  );
  return response.data;
}

export async function exportInvestmentReturns(): Promise<void> {
  const response = await axiosInstance.get("/api/admin/investment-return/export", {
    responseType: "blob",
  });

  const blob = new Blob([response.data]);
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  link.setAttribute("download", `InvestmentReturns_${dateStr}.xlsx`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function deleteInvestmentReturn(id: number): Promise<any> {
  const response = await axiosInstance.delete(`/api/admin/investment-return/${id}`);
  return response.data;
}
