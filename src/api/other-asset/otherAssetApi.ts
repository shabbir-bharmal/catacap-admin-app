import axiosInstance from "../axios";

export interface OtherAssetParams {
  currentPage?: number;
  perPage?: number;
  sortField?: string;
  sortDirection?: string;
  searchValue?: string;
  status?: string;
}

export interface NoteAttachmentEntry {
  id: number;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  url: string | null;
}

export interface NoteEntry {
  id: number;
  oldStatus: string;
  newStatus: string;
  note: string;
  userName: string;
  createdAt: string;
  attachments?: NoteAttachmentEntry[];
}

export interface AttachmentUploadInput {
  fileName: string;
  mimeType: string;
  base64Data: string;
}

export interface OtherAssetEntry {
  id: number;
  name: string;
  email: string;
  investmentName: string | null;
  assetType: string;
  approximateAmount: number;
  receivedAmount: number;
  contactMethod: string;
  contactValue: string;
  status: string;
  hasNotes: boolean;
  createdAt: string;
  noteEntries?: NoteEntry[];
}

export interface PaginatedOtherAssetResponse {
  items: OtherAssetEntry[];
  totalCount: number;
  currentPage: number;
  perPage: number;
  totalPages: number;
}

export async function fetchOtherAssets(
  params?: OtherAssetParams
): Promise<PaginatedOtherAssetResponse> {
  const queryParams: Record<string, string> = {};

  if (params) {
    if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
    if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
    if (params.sortField) queryParams.SortField = params.sortField;
    if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
    if (params.searchValue !== undefined && params.searchValue !== null && params.searchValue !== "") queryParams.SearchValue = params.searchValue;
    if (params.status && params.status !== "All") queryParams.Status = params.status;
  }

  const response = await axiosInstance.get<PaginatedOtherAssetResponse>(
    "/api/admin/other-asset",
    { params: queryParams }
  );

  return response.data;
}

export interface UpdateOtherAssetPayload {
  id: number;
  status: string;
  amount?: number;
  note?: string;
  noteEmail?: string[];
  attachments?: AttachmentUploadInput[];
}

export interface UpdateOtherAssetResponse {
  success: boolean;
  message: string;
}

export async function updateOtherAsset(
  payload: UpdateOtherAssetPayload
): Promise<UpdateOtherAssetResponse> {
  const response = await axiosInstance.put<UpdateOtherAssetResponse>(
    `/api/admin/other-asset/${payload.id}/status`,
    payload
  );
  return response.data;
}

export async function fetchOtherAssetNotes(id: number): Promise<NoteEntry[]> {
  const response = await axiosInstance.get<NoteEntry[]>(
    `/api/admin/other-asset/${id}/notes`
  );
  return response.data;
}

export async function exportOtherAssets(): Promise<void> {
  const response = await axiosInstance.get("/api/admin/other-asset/export", {
    responseType: "blob",
  });

  const blob = new Blob([response.data]);
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  link.setAttribute("download", `AssetPayments_${dateStr}.xlsx`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function deleteOtherAsset(id: number): Promise<any> {
  const response = await axiosInstance.delete(`/api/admin/other-asset/${id}`);
  return response.data;
}
