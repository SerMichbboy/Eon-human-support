import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { queryClient } from '@/core/providers/QueryProvider';

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  setTokens: (access: string, refresh: string, rawKeyB64?: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  getRawKeyB64: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  isAuthenticated: false,

  setTokens: async (access, refresh, rawKeyB64) => {
    await SecureStore.setItemAsync('access_token', access);
    await SecureStore.setItemAsync('refresh_token', refresh);
    if (rawKeyB64) {
      await SecureStore.setItemAsync('raw_key', rawKeyB64);
    }
    set({ accessToken: access, isAuthenticated: true });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('raw_key');
    queryClient.clear();
    set({ accessToken: null, isAuthenticated: false });
  },

  hydrate: async () => {
    const token = await SecureStore.getItemAsync('access_token');
    set({ accessToken: token, isAuthenticated: !!token });
  },

  getRawKeyB64: async () => SecureStore.getItemAsync('raw_key'),
}));
