import { File, Paths } from 'expo-file-system';
import { apiClient } from '@/shared/api/client';

/** Shared by ChatInput, OnboardingScreen, and ConversationOverlay — all three
 * record the same way (hold VoiceButton, get a WAV file:// uri) and need the
 * same transcribe call, so this used to be copy-pasted per call site. */
async function transcribe(uri: string): Promise<string> {
  const form = new FormData();
  form.append('audio', { uri, name: 'audio.wav', type: 'audio/wav' } as any);
  const { data } = await apiClient.post<{ text: string }>('/voice/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.text;
}

/** Returns a local file:// uri playable by `expo-av`'s `Audio.Sound` — the
 * response is raw `audio/mpeg` bytes, written straight to a cache file via
 * the new `expo-file-system` `File` API (no base64 round-trip needed, unlike
 * the legacy `writeAsStringAsync` API this replaces). */
async function synthesize(text: string): Promise<string> {
  const res = await apiClient.post<ArrayBuffer>(
    '/voice/synthesize',
    { text },
    { responseType: 'arraybuffer' }
  );
  const file = new File(Paths.cache, `tts-${Date.now()}.mp3`);
  file.create();
  file.write(new Uint8Array(res.data));
  return file.uri;
}

export const voiceApi = { transcribe, synthesize };
