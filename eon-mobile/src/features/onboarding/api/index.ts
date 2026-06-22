import { apiClient } from '@/shared/api/client';

export const onboardingApi = {
  saveStep: (data: Record<string, unknown>) =>
    apiClient.post('/onboarding/step', data),

  voiceStep: (step: string, audioUri: string) => {
    const form = new FormData();
    form.append('step', step);
    form.append('audio', { uri: audioUri, name: 'audio.m4a', type: 'audio/m4a' } as any);
    return apiClient.post('/onboarding/voice-step', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { step },
    });
  },
};
