import { useMutation } from '@tanstack/react-query';
import { unlockE2EKey, rawKeyToHeader } from '@/shared/crypto/e2e';
import { useAuthStore } from '@/shared/store/auth';
import { authApi } from '../api';

type LoginType = 'email' | 'phone';

async function handleLoginResponse(
  data: Awaited<ReturnType<typeof authApi.loginEmail>>['data'],
  password: string,
  credential: string,
  credentialType: LoginType,
  setTokens: Function,
) {
  let rawKeyB64: string | undefined;
  if (data.key_salt && data.encrypted_key && data.pbkdf2_c) {
    try {
      const rawKey = await unlockE2EKey(password, data.key_salt, data.encrypted_key, data.pbkdf2_c);
      rawKeyB64 = rawKeyToHeader(rawKey);
    } catch {
      // Key derivation failed — messages will show encrypted until user re-registers
    }
  }
  await setTokens(data.access_token, data.refresh_token, rawKeyB64);
  await useAuthStore.getState().setCredential(credential, credentialType);
}

export function useLoginEmail() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data } = await authApi.loginEmail(email, password);
      await handleLoginResponse(data, password, email, 'email', setTokens);
    },
  });
}

export function useLoginPhone() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: async ({ phone, password }: { phone: string; password: string }) => {
      const { data } = await authApi.loginPhone(phone, password);
      await handleLoginResponse(data, password, phone, 'phone', setTokens);
    },
  });
}
