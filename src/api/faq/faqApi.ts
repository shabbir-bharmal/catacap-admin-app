import axiosInstance from "../axios";

export interface FaqItem {
    id: number;
    category: number;
    categoryName: string;
    question: string;
    answer: string;
    status: boolean;
    displayOrder: number;
}

export interface FaqPaginatedResponse {
    totalRecords: number;
    items: FaqItem[];
}

export interface FaqSummaryResponse {
    categoryName: string;
    activeCount: number;
    totalCount: number;
}

export interface FaqCreateUpdatePayload {
    id?: number | null;
    category: number;
    question: string;
    answer: string;
    status: boolean;
}

export interface FaqReorderItem {
    id: number;
    displayOrder: number;
}

export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data: T;
}

export interface FaqParams {
    currentPage?: number;
    perPage?: number;
    searchValue?: string;
    status?: string | boolean;
    category?: number;
    sortField?: string;
    sortDirection?: string;
    isDeleted?: boolean;
}


export async function fetchFaqs(params?: FaqParams): Promise<FaqPaginatedResponse> {
    const queryParams: Record<string, string> = {};

    if (params) {
        if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
        if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
        if (params.searchValue !== undefined && params.searchValue !== null) queryParams.SearchValue = params.searchValue;
        if (params.status !== undefined) queryParams.Status = params.status.toString();
        if (params.category !== undefined) queryParams.Category = params.category.toString();
        if (params.sortField) queryParams.SortField = params.sortField;
        if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
        if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();
    }

    const response = await axiosInstance.get<any>(
        "/api/admin/faq",
        {
            params: queryParams,
            headers: { Accept: "application/json" },
        }
    );

    const data = response.data;

    if (Array.isArray(data)) {
        return { items: data, totalRecords: data.length };
    }

    return {
        items: data?.items ?? data?.data ?? [],
        totalRecords: data?.totalRecords ?? data?.totalCount ?? data?.total ?? 0,
    };
}

/**
 * Fetch FAQ by ID.
 */
export async function fetchFaqById(id: number): Promise<FaqItem[]> {
    const response = await axiosInstance.get<FaqItem[]>(`/api/admin/faq/${id}`);
    return response.data;
}

/**
 * Fetch FAQ summary counts.
 */
export async function fetchFaqSummary(): Promise<FaqSummaryResponse[]> {
    const response = await axiosInstance.get<FaqSummaryResponse[]>("/api/admin/faq/summary");
    return response.data;
}

/**
 * Create or update an FAQ.
 * If id is present, it's an update. If missing, it's a create.
 */
export async function createOrUpdateFaq(payload: FaqCreateUpdatePayload): Promise<ApiResponse<number>> {
    const response = await axiosInstance.post<ApiResponse<number>>("/api/admin/faq", payload, {
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/octet-stream"
        }
    });
    return response.data;
}

/**
 * Delete an FAQ.
 */
export async function deleteFaq(id: number): Promise<ApiResponse<null>> {
    const response = await axiosInstance.delete<ApiResponse<null>>(`/api/admin/faq/${id}`);
    return response.data;
}

/**
 * Reorder FAQs within a category.
 */
export async function reorderFaqs(reorderItems: FaqReorderItem[]): Promise<ApiResponse<null>> {
    const response = await axiosInstance.post<ApiResponse<null>>("/api/admin/faq/reorder", reorderItems);
    return response.data;
}
