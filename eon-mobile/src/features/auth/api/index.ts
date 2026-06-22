import { apiClient } from '@/shared/api/client';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RegisterResponse {
  user_id: string;
  message: string;
}

export const authApi = {
  registerEmail: (email: string, password: string) =>
    apiClient.post<RegisterResponse>('/auth/register/email', { email, password }),

  registerPhone: (phone: string, password: string) =>
    apiClient.post<RegisterResponse>('/auth/register/phone', { phone, password }),

  loginEmail: (email: string, password: string) =>
    apiClient.post<TokenResponse>('/auth/login/email', { email, password }),

  loginPhone: (phone: string, password: string) =>
    apiClient.post<TokenResponse>('/auth/login/phone', { phone, password }),
};
