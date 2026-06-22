import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { VoiceButton } from '@/features/voice/components/VoiceButton';
import { useAudioRecorder } from '@/features/voice/hooks/useAudioRecorder';
import { apiClient } from '@/shared/api/client';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const recorder = useAudioRecorder();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleVoiceStop = async () => {
    const uri = await recorder.stop();
    if (!uri) return;

    const form = new FormData();
    form.append('audio', { uri, name: 'audio.m4a', type: 'audio/m4a' } as any);

    try {
      const { data } = await apiClient.post<{ text: string }>('/voice/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.text) onSend(data.text);
    } finally {
      recorder.reset();
    }
  };

  return (
    <View style={styles.root}>
      <TextInput
        style={styles.input}
        placeholder="Напиши что-нибудь..."
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={2000}
        selectionColor={colors.accent}
        editable={!disabled}
      />

      <VoiceButton
        state={recorder.state}
        onPressIn={recorder.start}
        onPressOut={handleVoiceStop}
      />

      <TouchableOpacity
        style={[styles.sendBtn, (!text.trim() || disabled) && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
      >
        <Text style={styles.sendIcon}>↑</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    maxHeight: 120,
    ...typography.body,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.accentMuted },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
