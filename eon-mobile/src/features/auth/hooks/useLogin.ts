import { useMutation } from '@tanstack/react-query';
import { unlockE2EKey, rawKeyToHeader } from '@/shared/crypto/e2e';
import { useAuthStore } from '@/shared/store/auth';
import { authApi } from '../api';

async function handleLoginResponse(
  data: Awaited<ReturnType<typeof authApi.loginEmail>>['data'],
  password: string,
  setTokens: Function,
) {
  let rawKeyB64: string | undefined;
  if (data.key_salt && data.encrypted_key) {
    try {
      const rawKey = await unlockE2EKey(password, data.key_salt, data.encrypted_key);
      rawKeyB64 = rawKeyToHeader(rawKey);
    } catch {
      // Key derivation failed (wrong password) — login will still succeed for now
    }
  }
  await setTokens(data.access_token, data.refresh_token, rawKeyB64);
}

export function useLoginEmail() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data } = await authApi.loginEmail(email, password);
      await handleLoginResponse(data, password, setTokens);
    },
  });
}

export function useLoginPhone() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: async ({ phone, password }: { phone: string; password: string }) => {
      const { data } = await authApi.loginPhone(phone, password);
      await handleLoginResponse(data, password, setTokens);
    },
  });
}
