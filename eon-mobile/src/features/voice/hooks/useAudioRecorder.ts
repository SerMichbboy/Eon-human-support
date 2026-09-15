import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder as useExpoAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'locked' | 'done';

// Always WAV/16kHz/mono — vsegpt's transcription endpoint rejects m4a (see
// CLAUDE.md's STT notes). `outputFormat`/`audioEncoder` on Android and
// `outputFormat`/`audioQuality` on iOS are expo-audio's string/enum
// equivalents of expo-av's old numeric constants (DEFAULT=6→'default',
// AAC=3→'aac', MAX=127→AudioQuality.MAX, 'lpcm'→IOSOutputFormat.LINEARPCM) —
// same settings, just expo-audio's current API shape.
const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: {
    outputFormat: 'default',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/wav', bitsPerSecond: 128000 },
};

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const recorder = useExpoAudioRecorder(RECORDING_OPTIONS);

  const start = useCallback(async () => {
    await requestRecordingPermissionsAsync();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
  }, [recorder]);

  const lock = useCallback(() => {
    setState('locked');
  }, []);

  const stop = useCallback(async (): Promise<string | null> => {
    if (!recorder.isRecording) return null;
    await recorder.stop();
    const fileUri = recorder.uri;
    setUri(fileUri ?? null);
    setState('done');
    return fileUri ?? null;
  }, [recorder]);

  const cancel = useCallback(async () => {
    if (!recorder.isRecording) {
      setState('idle');
      return;
    }
    try {
      await recorder.stop();
    } catch {
      // Best-effort — cancelling shouldn't surface an error to the user.
    }
    setUri(null);
    setState('idle');
  }, [recorder]);

  const reset = useCallback(() => {
    if (recorder.isRecording) {
      recorder.stop().catch(() => {});
    }
    setUri(null);
    setState('idle');
  }, [recorder]);

  return { state, uri, start, lock, stop, cancel, reset };
}
