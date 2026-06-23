import { apiClient } from '@/shared/api/client';

function mapStepPayload(step: string, text: string): Record<string, unknown> {
  switch (step) {
    case 'intro':
      return { step, basic_info: { preferred_name: text } };
    case 'life_context':
      return { step, life_context: { occupation: text } };
    case 'positive_moments':
      return { step, positive_moments: { sources_of_energy: [text] } };
    case 'struggles':
      return { step, struggles: { coping_mechanisms: [text] } };
    case 'companion_preferences':
      return {
        step,
        companion_preferences: {
          communication_style: text,
        },
      };
    default:
      return { step };
  }
}

export const onboardingApi = {
  saveStep: (step: string, text?: string) =>
    apiClient.post('/onboarding/step', text ? mapStepPayload(step, text) : { step }),

  voiceStep: (step: string, audioUri: string) => {
    const form = new FormData();
    form.append('step', step);
    form.append('audio', { uri: audioUri, name: 'audio.wav', type: 'audio/wav' } as any);
    return apiClient.post('/onboarding/voice-step', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { step },
    });
  },
};
