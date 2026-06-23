import { apiClient } from '@/shared/api/client';

export interface ProfileData {
  basic_info: { preferred_name?: string; age?: number; location?: string };
  life_context: { occupation?: string; family_status?: string; close_people: string[]; values: string[] };
  positive_moments: { joyful_memories: string[]; sources_of_energy: string[]; dreams: string[] };
  struggles: { anxiety_topics: string[]; difficult_periods: string[]; coping_mechanisms: string[] };
  key_events: { description: string; emotional_weight: number; approximate_date?: string; type: string }[];
  companion_preferences: { tone: string; directiveness: string; forbidden_topics: string[]; communication_style: string };
}

export const profileApi = {
  get: () => apiClient.get<ProfileData>('/profile/'),
  update: (data: Partial<ProfileData> & { step?: string }) => apiClient.patch<ProfileData>('/profile/', data),
};
