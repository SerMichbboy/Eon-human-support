import { apiClient } from '@/shared/api/client';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  key_salt?: string;
  encrypted_key?: string;
}

export interface RegisterResponse {
  user_id: string;
  message: string;
}

export const authApi = {
  registerEmail: (email: string, password: string, keySalt: string, encryptedKey: string) =>
    apiClient.post<RegisterResponse>('/auth/register/email', {
      email, password, key_salt: keySalt, encrypted_key: encryptedKey,
    }),

  registerPhone: (phone: string, password: string, keySalt: string, encryptedKey: string) =>
    apiClient.post<RegisterResponse>('/auth/register/phone', {
      phone, password, key_salt: keySalt, encrypted_key: encryptedKey,
    }),

  loginEmail: (email: string, password: string) =>
    apiClient.post<TokenResponse>('/auth/login/email', { email, password }),

  loginPhone: (phone: string, password: string) =>
    apiClient.post<TokenResponse>('/auth/login/phone', { phone, password }),
};
