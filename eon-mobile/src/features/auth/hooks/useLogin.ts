import { useMutation } from '@tanstack/react-query';
import { unlockE2EKey, rawKeyToHeader } from '@/shared/crypto/e2e';
import { useAuthStore } from '@/shared/store/auth';
import { identifierType } from '../identifier';
import { authApi, TokenResponse } from '../api';

/** Shared by useLogin and VerifyCodeScreen (which logs in itself right after
 * a successful /auth/verify, since registration no longer logs the user in
 * directly — the account isn't verified yet at that point). */
export async function completeLoginFromTokens(
  identifier: string,
  password: string,
  data: TokenResponse,
  setTokens: (access: string, refresh: string, rawKeyB64?: string) => Promise<void>,
): Promise<void> {
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
  await useAuthStore.getState().setCredential(identifier, identifierType(identifier));
}

export function useLogin() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: async ({ identifier, password }: { identifier: string; password: string }) => {
      const { data } = await authApi.login(identifier, password);
      await completeLoginFromTokens(identifier, password, data, setTokens);
    },
  });
}
