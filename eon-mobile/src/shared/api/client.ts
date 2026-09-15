import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// Without a timeout, a misconfigured/unreachable BASE_URL (e.g. `localhost`
// baked into a build meant for a physical device) hangs every request
// indefinitely instead of failing with a clear error — same reasoning as
// `refreshTokens`'s own `timeout: 8000` below, just longer since this client
// also carries slower calls (voice transcribe/synthesize).
export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // /auth/register has no authenticated session yet — a raw_key left over in
  // SecureStore from a previous account on this device must never be sent
  // here, or the backend encrypts the new account's default companion name
  // with someone else's key and it can never be decrypted again.
  if (!config.url?.includes('/auth/register')) {
    const rawKey = await SecureStore.getItemAsync('raw_key');
    if (rawKey) config.headers['X-User-Key'] = rawKey;
  }
  return config;
});

/** Shared by the response interceptor below and `useChat`'s WS reconnect —
 * the access token is short-lived (15 min, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`)
 * and the WS connection has no interceptor of its own to catch a 401 and
 * retry, so it needs this exact same refresh call available directly.
 * `useChat` calls this on *every* socket close, not just ones confirmed to be
 * token-related (no cheap way to tell from there) — so a plain network blip
 * (the server restarting, a dropped connection) is a completely routine way
 * for this call to fail, not evidence the refresh token itself is bad. Only
 * clear stored tokens when the server actually rejected them (401/403);
 * anything else (timeout, no connection at all) leaves them alone so a
 * transient failure here can't silently log the user out. `timeout: 8000`
 * so this can't hang indefinitely either — see `useChat.ts`'s `onclose`,
 * which deliberately doesn't await this at all for the same reason. */
export async function refreshTokens(): Promise<boolean> {
  try {
    const refresh = await SecureStore.getItemAsync('refresh_token');
    if (!refresh) return false;
    const { data } = await axios.post(
      `${BASE_URL}/api/v1/auth/refresh`,
      { refresh_token: refresh },
      { timeout: 8000 }
    );
    await SecureStore.setItemAsync('access_token', data.access_token);
    await SecureStore.setItemAsync('refresh_token', data.refresh_token);
    return true;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 401 || status === 403) {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
    }
    return false;
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (await refreshTokens()) {
        const token = await SecureStore.getItemAsync('access_token');
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      }
    }
    return Promise.reject(error);
  }
);

export const WS_URL = BASE_URL.replace(/^http/, 'ws');
