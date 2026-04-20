import axiosInstance from "../axios";

export interface EventApiItem {
    id: number;
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
    registrationLink: string;
    status: boolean;
    image: string;
    imageFileName?: string;
    duration?: string | null;
    type?: string | null;
}

export interface PaginatedEventResponse {
    totalRecords: number;
    items: EventApiItem[];
}

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data: T;
}

export interface EventCreateUpdatePayload {
    id?: number;
    title: string;
    description: string;
    eventDate: string;
    eventTime: string;
    registrationLink: string;
    status: boolean;
    image?: string | null;
    imageFileName?: string | null;
    duration?: string | null;
    type?: string | null;
}

/**
 * Fetch all events for admin.
 */
export async function fetchAdminEvents(params?: {
    currentPage?: number;
    perPage?: number;
    searchValue?: string;
    sortField?: string;
    sortDirection?: "asc" | "desc";
    isDeleted?: boolean;
}): Promise<PaginatedEventResponse> {
    const queryParams: Record<string, string> = {};

    if (params) {
        if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
        if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
        if (params.searchValue !== undefined) queryParams.SearchValue = params.searchValue;
        if (params.sortField) queryParams.SortField = params.sortField;
        if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
        if (params.isDeleted !== undefined) queryParams.IsDeleted = params.isDeleted.toString();
    }

    const response = await axiosInstance.get<PaginatedEventResponse>("/api/admin/event", { params: queryParams });
    return response.data;
}

/**
 * Fetch a single event by ID for admin.
 */
export async function fetchAdminEventById(id: number): Promise<EventApiItem> {
    const response = await axiosInstance.get<EventApiItem>(`/api/admin/event/${id}`);
    return response.data;
}

/**
 * Create or update an event.
 * POST /api/admin/event
 * - Sending `id` in body -> backend treats as UPDATE
 * - Omitting `id` -> backend treats as CREATE
 */
export async function createOrUpdateEvent(payload: EventCreateUpdatePayload): Promise<ApiResponse<number>> {
    const response = await axiosInstance.post<ApiResponse<number>>("/api/admin/event", payload);
    return response.data;
}

/**
 * Delete an event by ID.
 */
export async function deleteEvent(id: number): Promise<ApiResponse> {
    const response = await axiosInstance.delete<ApiResponse>(`/api/admin/event/${id}`);
    return response.data;
}

/**
 * Fetch upcoming events (public/client side).
 */
export async function fetchUpcomingEvents(): Promise<EventApiItem[]> {
    const response = await axiosInstance.get<EventApiItem[]>("/api/event");
    return response.data;
}

export interface EventRegistrationItem {
    id: number;
    eventSlug: string;
    firstName: string;
    lastName: string;
    email: string;
    guestName: string | null;
    referredBy: string | null;
    createdAt: string;
}

export interface PaginatedEventRegistrationResponse {
    totalRecords: number;
    items: EventRegistrationItem[];
}

export async function fetchEventRegistrations(params?: {
    currentPage?: number;
    perPage?: number;
    searchValue?: string;
    sortField?: string;
    sortDirection?: "asc" | "desc";
}): Promise<PaginatedEventRegistrationResponse> {
    const queryParams: Record<string, string> = {};
    if (params) {
        if (params.currentPage !== undefined) queryParams.CurrentPage = params.currentPage.toString();
        if (params.perPage !== undefined) queryParams.PerPage = params.perPage.toString();
        if (params.searchValue !== undefined) queryParams.SearchValue = params.searchValue;
        if (params.sortField) queryParams.SortField = params.sortField;
        if (params.sortDirection) queryParams.SortDirection = params.sortDirection;
    }
    const response = await axiosInstance.get<PaginatedEventRegistrationResponse>(
        "/api/admin/event/registrations",
        { params: queryParams }
    );
    return response.data;
}

export async function deleteEventRegistration(id: number): Promise<ApiResponse> {
    const response = await axiosInstance.delete<ApiResponse>(`/api/admin/event/registrations/${id}`);
    return response.data;
}
