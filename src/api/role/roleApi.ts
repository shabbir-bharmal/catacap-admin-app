import axiosInstance from "../axios";

export interface RolePermission {
    moduleId: number;
    moduleName: string;
    isManage: boolean;
    isDelete: boolean;
}

export interface ModuleItem {
    id: number;
    name: string;
    category: string;
    sortOrder: number;
}

export interface Role {
    roleId: string;
    roleName: string;
    isSuperAdmin: boolean;
    permissions: RolePermission[];
}

export interface ApiResponse<T = null> {
    success: boolean;
    message: string;
    data?: T;
}

export async function fetchModules(): Promise<ModuleItem[]> {
    const response = await axiosInstance.get<ModuleItem[]>("/api/module-access-permission/module");
    return response.data;
}

/**
 * Fetch all roles.
 */
export async function fetchRoles(): Promise<Role[]> {
    const response = await axiosInstance.get<Role[]>("/api/module-access-permission");
    return response.data;
}

/**
 * Fetch a single role by ID.
 */
export async function fetchRoleById(id: string): Promise<Role> {
    const response = await axiosInstance.get<Role>(`/api/module-access-permission/${id}`);
    return response.data;
}

/**
 * Create a new role.
 */
export async function createRole(payload: { roleName: string; isSuperAdmin: boolean; permissions: RolePermission[] }): Promise<ApiResponse<string>> {
    const response = await axiosInstance.post<ApiResponse<string>>("/api/module-access-permission", payload);
    return response.data;
}

/**
 * Update an existing role.
 */
export async function updateRole(payload: { roleId: string; roleName: string; isSuperAdmin: boolean; permissions: RolePermission[] }): Promise<ApiResponse<string>> {
    const response = await axiosInstance.post<ApiResponse<string>>("/api/module-access-permission", payload);
    return response.data;
}

/**
 * Delete a role by ID.
 */
export async function deleteRole(id: string): Promise<ApiResponse> {
    const response = await axiosInstance.delete<ApiResponse>(`/api/module-access-permission/${id}`);
    return response.data;
}