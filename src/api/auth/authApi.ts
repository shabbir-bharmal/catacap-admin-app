import axiosInstance from "../axios";

export interface LoginPayload {
  email: string;
  password?: string;
  code?: number;
}

export interface LoginResponse {
  token?: string;
  requires2FA?: boolean;
  email?: string;
  message?: string;
}

export async function loginWithCredentials(payload: LoginPayload): Promise<LoginResponse> {
  const response = await axiosInstance.post<LoginResponse>("/api/userauthentication/admin/login", payload);
  return response.data;
}

export async function verifyTwoFactor(payload: LoginPayload): Promise<LoginResponse> {
  const response = await axiosInstance.post<LoginResponse>("/api/userauthentication/verify-2fa", payload);
  return response.data;
}
