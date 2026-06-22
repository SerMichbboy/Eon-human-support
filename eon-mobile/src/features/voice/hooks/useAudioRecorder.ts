import { Audio } from 'expo-av';
import { useCallback, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'done';

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const recording = useRef<Audio.Recording | null>(null);

  const start = useCallback(async () => {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recording.current = rec;
    setState('recording');
  }, []);

  const stop = useCallback(async (): Promise<string | null> => {
    if (!recording.current) return null;
    await recording.current.stopAndUnloadAsync();
    const fileUri = recording.current.getURI();
    recording.current = null;
    setUri(fileUri ?? null);
    setState('done');
    return fileUri ?? null;
  }, []);

  const reset = useCallback(() => {
    setUri(null);
    setState('idle');
  }, []);

  return { state, uri, start, stop, reset };
}
