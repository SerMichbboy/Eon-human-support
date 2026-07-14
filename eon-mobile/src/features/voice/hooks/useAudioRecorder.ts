import { Audio } from 'expo-av';
import { useCallback, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'locked' | 'done';

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const recording = useRef<Audio.Recording | null>(null);

  const start = useCallback(async () => {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const { recording: rec } = await Audio.Recording.createAsync({
      android: {
        extension: '.wav',
        outputFormat: 6 /* DEFAULT */,
        audioEncoder: 3 /* AAC */,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: '.wav',
        outputFormat: 'lpcm',
        audioQuality: 127 /* MAX */,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: { mimeType: 'audio/wav', bitsPerSecond: 128000 },
    });
    recording.current = rec;
    setState('recording');
  }, []);

  const lock = useCallback(() => {
    setState('locked');
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

  const cancel = useCallback(async () => {
    if (!recording.current) return;
    try {
      await recording.current.stopAndUnloadAsync();
    } catch {}
    recording.current = null;
    setUri(null);
    setState('idle');
  }, []);

  const reset = useCallback(() => {
    if (recording.current) {
      recording.current.stopAndUnloadAsync().catch(() => {});
      recording.current = null;
    }
    setUri(null);
    setState('idle');
  }, []);

  return { state, uri, start, lock, stop, cancel, reset };
}
