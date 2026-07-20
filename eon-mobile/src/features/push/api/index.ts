import { apiClient } from '@/shared/api/client';

export const pushApi = {
  register: (token: string) => apiClient.post('/push/register', { token }),
};
