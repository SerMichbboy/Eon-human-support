import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { VoiceButton } from '@/features/voice/components/VoiceButton';
import { useAudioRecorder } from '@/features/voice/hooks/useAudioRecorder';
import { apiClient } from '@/shared/api/client';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recorder = useAudioRecorder();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotOpacity = useSharedValue(1);

  const isLocked = recorder.state === 'locked';
  const isRecording = recorder.state === 'recording' || isLocked;

  useEffect(() => {
    if (isRecording) {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  useEffect(() => {
    if (isLocked) {
      dotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
      );
    } else {
      dotOpacity.value = 1;
    }
  }, [isLocked]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const transcribeAndSend = async (uri: string) => {
    const form = new FormData();
    form.append('audio', { uri, name: 'audio.wav', type: 'audio/wav' } as any);
    try {
      const { data } = await apiClient.post<{ text: string }>('/voice/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.text) onSend(data.text);
    } finally {
      recorder.reset();
    }
  };

  const handleVoiceSend = async () => {
    const uri = await recorder.stop();
    if (uri) transcribeAndSend(uri);
  };

  const handleVoiceRelease = async () => {
    const uri = await recorder.stop();
    if (uri) transcribeAndSend(uri);
  };

  if (isLocked) {
    return (
      <View style={[styles.bar, { backgroundColor: colors.bgCard, borderColor: colors.accent, shadowColor: colors.accent }]}>
        <TouchableOpacity
          style={[styles.roundBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
          onPress={recorder.cancel}
        >
          <Ionicons name="close-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.recordingIndicator}>
          <Animated.View style={[styles.recDot, dotStyle, { backgroundColor: colors.accent }]} />
          <Text style={[styles.recTime, { color: colors.textPrimary }]}>{formatTime(seconds)}</Text>
        </View>

        <TouchableOpacity style={[styles.roundBtn, styles.sendRoundBtn, { backgroundColor: colors.accent }]} onPress={handleVoiceSend}>
          <Ionicons name="arrow-up-outline" size={20} color={colors.onAccent} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: colors.bgCard, borderColor: colors.accent, shadowColor: colors.accent }]}>
      <TextInput
        style={[styles.input, { color: colors.textPrimary }]}
        placeholder="Напиши что-нибудь..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
        selectionColor={colors.accent}
        editable={!disabled && !isRecording}
      />

      <VoiceButton
        state={recorder.state}
        onPressIn={recorder.start}
        onPressOut={handleVoiceRelease}
        onLock={recorder.lock}
      />

      <TouchableOpacity
        style={[styles.roundBtn, styles.sendRoundBtn, { backgroundColor: text.trim() && !disabled ? colors.accent : colors.accentMuted }]}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
      >
        <Ionicons name="arrow-up-outline" size={20} color={colors.onAccent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    minHeight: 60,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    maxHeight: 120,
    ...typography.body,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRoundBtn: { borderWidth: 0 },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  recDot: { width: 8, height: 8, borderRadius: 4 },
  recTime: { ...typography.body, fontVariant: ['tabular-nums'] },
});
