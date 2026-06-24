import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { queryClient } from '@/core/providers/QueryProvider';

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  credential: string | null;
  credentialType: 'email' | 'phone' | null;
  setTokens: (access: string, refresh: string, rawKeyB64?: string) => Promise<void>;
  setCredential: (value: string, type: 'email' | 'phone') => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  getRawKeyB64: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  isAuthenticated: false,
  credential: null,
  credentialType: null,

  setCredential: async (value, type) => {
    await SecureStore.setItemAsync('auth_credential', value);
    await SecureStore.setItemAsync('auth_credential_type', type);
    set({ credential: value, credentialType: type });
  },

  setTokens: async (access, refresh, rawKeyB64) => {
    await SecureStore.setItemAsync('access_token', access);
    await SecureStore.setItemAsync('refresh_token', refresh);
    if (rawKeyB64) {
      await SecureStore.setItemAsync('raw_key', rawKeyB64);
    }
    set({ accessToken: access, isAuthenticated: true });
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync('access_token'),
      SecureStore.deleteItemAsync('refresh_token'),
      SecureStore.deleteItemAsync('raw_key'),
      SecureStore.deleteItemAsync('auth_credential'),
      SecureStore.deleteItemAsync('auth_credential_type'),
    ]);
    queryClient.clear();
    set({ accessToken: null, isAuthenticated: false, credential: null, credentialType: null });
  },

  hydrate: async () => {
    const [token, credential, credentialType] = await Promise.all([
      SecureStore.getItemAsync('access_token'),
      SecureStore.getItemAsync('auth_credential'),
      SecureStore.getItemAsync('auth_credential_type'),
    ]);
    set({
      accessToken: token,
      isAuthenticated: !!token,
      credential,
      credentialType: (credentialType as 'email' | 'phone' | null) ?? null,
    });
  },

  getRawKeyB64: async () => SecureStore.getItemAsync('raw_key'),
}));
