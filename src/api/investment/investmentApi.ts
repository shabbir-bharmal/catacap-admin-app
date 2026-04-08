import axiosInstance, { getToken, API_ACCESS_TOKEN } from "../axios";

export interface InvestmentParams {
    currentPage?: number;
    perPage?: number;
    sortField?: string;
    sortDirection?: string;
    searchValue?: string;
    status?: string;
    investmentId?: number;
    filterByGroup?: boolean;
    stages?: string;
    investmentStatus?: boolean;
    isDeleted?: boolean;
}

export interface PaginatedInvestmentResponse {
    items: any[]; // The UI will map this if needed, or we can use the exact type
    totalCount: number;
    currentPage: number;
    perPage: number;
    totalPages: number;
}

export async function fetchInvestments(
    params?: InvestmentParams
): Promise<PaginatedInvestmentResponse> {
    const queryParams: Record<string, string> = {};

    if (params) {
        if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
        if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
        if (params.sortField) queryParams.SortField = params.sortField;
        if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
        if (params.searchValue !== undefined && params.searchValue !== null && params.searchValue !== "") queryParams.SearchValue = params.searchValue;
        if (params.status) queryParams.Status = params.status;
        if (params.investmentId !== undefined) queryParams.InvestmentId = params.investmentId.toString();
        if (params.filterByGroup !== undefined) queryParams.FilterByGroup = params.filterByGroup.toString();
        if (params.stages) queryParams.Stages = params.stages;
        if (params.investmentStatus !== undefined) queryParams.InvestmentStatus = params.investmentStatus.toString();
        if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();
    }

    const response = await axiosInstance.get<PaginatedInvestmentResponse>(
        "/api/admin/investment",
        { params: queryParams }
    );

    return response.data;
}

export async function createInvestment(data: any): Promise<any> {
    const response = await axiosInstance.post("/api/admin/investment", data, {
        headers: {
            "Content-Type": "application/json"
        }
    });
    return response.data;
}

export async function exportInvestmentsData(): Promise<void> {
    const response = await axiosInstance.get("/api/admin/investment/export", {
        responseType: "blob",
    });

    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;

    const now = new Date();
    const fileName = `Investments_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.xlsx`;
    link.setAttribute("download", fileName);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
}

export async function fetchInvestmentNotes(investmentId: number): Promise<any> {
    const response = await axiosInstance.get(`/api/admin/investment/${investmentId}/notes`);
    return response.data;
}

export async function cloneInvestment(investmentId: number, name: string): Promise<any> {
    const response = await axiosInstance.post(`/api/admin/investment/${investmentId}/clone`, null, {
        params: { name }
    });
    return response.data;
}

export async function updateInvestmentStatus(investmentId: number, status: boolean): Promise<any> {
    const response = await axiosInstance.put(`/api/admin/investment/${investmentId}/status`, null, {
        params: { status }
    });
    return response.data;
}

export async function fetchInvestmentById(investmentId: number): Promise<any> {
    const response = await axiosInstance.get(`/api/admin/investment/${investmentId}`);
    return response.data;
}

export async function updateInvestment(investmentId: number, data: any): Promise<any> {
    const response = await axiosInstance.put(`/api/admin/investment/${investmentId}`, data, {
        headers: {
            "Content-Type": "application/json"
        }
    });
    return response.data;
}

export async function deleteInvestment(investmentId: number): Promise<any> {
    const response = await axiosInstance.delete(`/api/admin/investment/${investmentId}`);
    return response.data;
}

export async function exportInvestmentRecommendations(investmentId: number, investmentName: string): Promise<void> {
    const response = await axiosInstance.get(`/api/admin/investment/${investmentId}/recommendations/export`, {
        responseType: "blob",
    });

    if (response.headers["content-type"]?.includes("application/json")) {
        const text = await (response.data as Blob).text();
        const json = JSON.parse(text);
        if (json.Success === false || json.success === false) {
            throw new Error(json.Message || json.message || "There are no recommendations to export.");
        }
    }

    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;

    const now = new Date();
    const formattedDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const cleanName = investmentName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `Recommendations_${cleanName}_${formattedDate}.xlsx`;
    
    link.setAttribute("download", fileName);
    link.target = "_self";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
}

export async function fetchInvestmentData(): Promise<any> {
    const response = await axiosInstance.get("/api/admin/investment/data");
    return response.data;
}

export async function fetchCountries(): Promise<any> {
    const response = await axiosInstance.get("/api/admin/investment/countries");
    return response.data;
}


export async function fetchAllInvestmentNameList(investmentStage: number = 0, investmentId: number): Promise<any[]> {
    const response = await axiosInstance.get("/api/Campaign/get-all-investment-name-list", {
        params: { investmentStage, investmentId }
    });
    return response.data;
}

export function downloadInvestmentDocument(
    action: string,
    pdfFileName: string,
    originalPdfFileName: string
): void {
    const token = getToken();
    const params = new URLSearchParams({
        action,
        pdfFileName,
        originalPdfFileName,
        stream: "true",
        _token: token,
        _apiToken: API_ACCESS_TOKEN,
    });
    window.location.href = `/api/admin/investment/document/?${params.toString()}`;
}

export enum InvestmentRequestStatus {
    Draft = 0,
    Submitted = 1,
    UnderReview = 2,
    Approved = 3,
    Rejected = 4
}

export interface InvestmentRequestItem {
    id: number;
    organization: string;
    country: string;
    status: InvestmentRequestStatus;
    statusName: string;
    submitted: string;
    goal: number | null;
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
}

export interface PaginatedInvestmentRequestResponse {
    items: InvestmentRequestItem[];
    totalCount: number;
}

export async function fetchInvestmentRequests(
    params?: InvestmentParams
): Promise<PaginatedInvestmentRequestResponse> {
    const queryParams: Record<string, string> = {};

    if (params) {
        if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
        if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
        if (params.sortField) queryParams.SortField = params.sortField;
        if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
        if (params.searchValue !== undefined && params.searchValue !== null && params.searchValue !== "") queryParams.SearchValue = params.searchValue;
        if (params.status) queryParams.investmentRequestStatus = params.status;
        if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();
    }

    const response = await axiosInstance.get<PaginatedInvestmentRequestResponse>(
        "/api/admin/investment/request",
        { params: queryParams }
    );

    return response.data;
}

export async function fetchInvestmentRequestById(id: number): Promise<{ item: any }> {
    const response = await axiosInstance.get<{ item: any }>(`/api/admin/investment/request/${id}`);
    return response.data;
}

export async function sendInvestmentQrCodeEmail(investmentId: number, investmentTag: string): Promise<{ success: boolean; message: string }> {
    const response = await axiosInstance.get<{ success: boolean; message: string }>(
        "/api/Campaign/send-investment-qr-code-email",
        { params: { id: investmentId, investmentTag } }
    );
    return response.data;
}

export async function exportInvestmentNotesApi(campaignId: number, campaignName?: string): Promise<void> {
    const response = await axiosInstance.get("/api/Campaign/export-investment-notes", {
        params: { campaignId },
        responseType: "blob",
    });

    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;

    const now = new Date();
    const formattedDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const cleanName = campaignName ? campaignName : "investment";
    const fileName = `${cleanName}_Investment_Notes_${formattedDate}.xlsx`;

    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
}
