import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/store/auth';
import { authApi } from '../api';

export function useRegisterEmail() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.registerEmail(email, password),
    onSuccess: async (_, vars) => {
      const { data } = await authApi.loginEmail(vars.email, vars.password);
      await setTokens(data.access_token, data.refresh_token);
    },
  });
}

export function useRegisterPhone() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      authApi.registerPhone(phone, password),
    onSuccess: async (_, vars) => {
      const { data } = await authApi.loginPhone(vars.phone, vars.password);
      await setTokens(data.access_token, data.refresh_token);
    },
  });
}
