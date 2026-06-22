import { apiClient } from '@/shared/api/client';

export const companionApi = {
  get: () => apiClient.get<{ name: string }>('/companion/'),
  rename: (name: string) => apiClient.patch<{ name: string }>('/companion/name', { name }),
};
