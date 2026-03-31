import axiosInstance from "../axios";

export interface TeamMember {
    id: number;
    fullName: string | null;
    firstName: string;
    lastName: string;
    designation: string;
    description: string;
    imageFileName: string | null;
    linkedInUrl: string | null;
    isManagement: boolean;
    displayOrder: number;
}

export interface TeamListResponse {
    totalCount: number;
    items: TeamMember[];
}

export interface TeamCreatePayload {
    firstName: string;
    lastName: string;
    designation: string;
    description: string;
    image: string;
    linkedInUrl: string;
    isManagement: boolean;
}

export interface TeamUpdatePayload {
    id: number;
    firstName: string;
    lastName: string;
    designation: string;
    description: string;
    image?: string;
    imageFileName: string;
    linkedInUrl: string;
    isManagement: boolean;
}

export interface TeamReorderItem {
    id: number;
    displayOrder: number;
}

export interface ApiResponse<T = null> {
    success: boolean;
    message: string;
    data?: T;
}

/**
 * Fetch all team members with optional filtering and sorting.
 */
export async function fetchTeamMembers(params?: { SortField?: string; SortDirection?: string }): Promise<TeamListResponse> {
    const response = await axiosInstance.get<TeamListResponse>("/api/admin/team", { params });
    return response.data;
}

/**
 * Fetch a single team member by ID.
 */
export async function fetchTeamMemberById(id: number): Promise<TeamMember> {
    const response = await axiosInstance.get<TeamMember>(`/api/admin/team/${id}`);
    return response.data;
}

/**
 * Create a new team member.
 */
export async function createTeamMember(payload: TeamCreatePayload): Promise<ApiResponse<number>> {
    const response = await axiosInstance.post<ApiResponse<number>>("/api/admin/team", payload);
    return response.data;
}

/**
 * Update an existing team member.
 */
export async function updateTeamMember(payload: TeamUpdatePayload): Promise<ApiResponse<number>> {
    const response = await axiosInstance.post<ApiResponse<number>>("/api/admin/team", payload);
    return response.data;
}

/**
 * Delete a team member by ID.
 */
export async function deleteTeamMember(id: number): Promise<ApiResponse> {
    const response = await axiosInstance.delete<ApiResponse>(`/api/admin/team/${id}`);
    return response.data;
}

/**
 * Reorder team members.
 */
export async function reorderTeamMembers(items: TeamReorderItem[]): Promise<ApiResponse> {
    const response = await axiosInstance.post<ApiResponse>("/api/admin/team/reorder", items);
    return response.data;
}
