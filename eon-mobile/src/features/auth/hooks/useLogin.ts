import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/store/auth';
import { authApi } from '../api';

export function useLoginEmail() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.loginEmail(email, password),
    onSuccess: ({ data }) => setTokens(data.access_token, data.refresh_token),
  });
}

export function useLoginPhone() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      authApi.loginPhone(phone, password),
    onSuccess: ({ data }) => setTokens(data.access_token, data.refresh_token),
  });
}
