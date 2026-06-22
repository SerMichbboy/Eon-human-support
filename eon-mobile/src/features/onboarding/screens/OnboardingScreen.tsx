import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { Button } from '@/shared/components/Button';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { VoiceButton } from '@/features/voice/components/VoiceButton';
import { useAudioRecorder } from '@/features/voice/hooks/useAudioRecorder';
import { profileApi } from '@/features/profile/api';
import { onboardingApi } from '../api';

type Props = NativeStackScreenProps<AppStackParams, 'Onboarding'>;

const STEPS = [
  {
    key: 'intro',
    question: 'Как тебя зовут? Как мне к тебе обращаться?',
    hint: 'Можешь просто написать своё имя',
    placeholder: 'Например: Михаил, или просто Миша',
  },
  {
    key: 'life_context',
    question: 'Расскажи немного о себе — чем занимаешься, кто рядом в жизни?',
    hint: 'Работа, семья, друзья — всё что захочешь',
    placeholder: 'Работаю программистом, живу в Москве...',
  },
  {
    key: 'positive_moments',
    question: 'Что тебя радует или даёт силы? Есть ли что-то, о чём мечтаешь?',
    hint: 'Даже мелочи важны',
    placeholder: 'Люблю музыку, спорт, путешествия...',
  },
  {
    key: 'struggles',
    question: 'Бывают ли периоды, когда особенно тяжело? Как ты обычно справляешься?',
    hint: 'Это только между нами',
    placeholder: 'Иногда бывает тяжело с...',
  },
  {
    key: 'companion_preferences',
    question: 'Как ты хочешь, чтобы я был рядом — просто слушал или иногда давал совет?',
    hint: 'Ты всегда сможешь изменить это потом',
    placeholder: 'Просто слушай / Давай советы когда прошу...',
  },
];

function getInitialAnswers(profile: ReturnType<typeof profileApi.get> extends Promise<infer T> ? T extends { data: infer D } ? D : never : never | null | undefined): Record<string, string> {
  if (!profile) return {};
  return {
    intro: profile.basic_info?.preferred_name ?? '',
    life_context: profile.life_context?.occupation ?? '',
    positive_moments: profile.positive_moments?.sources_of_energy?.join('\n') ?? '',
    struggles: profile.struggles?.coping_mechanisms?.join('\n') ?? '',
    companion_preferences:
      profile.companion_preferences?.directiveness === 'advisor'
        ? 'Давай советы когда прошу'
        : profile.companion_preferences?.directiveness === 'listener'
        ? 'Просто слушай'
        : '',
  };
}

export function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const canClose = navigation.canGoBack();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('text');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const recorder = useAudioRecorder();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
    retry: false,
  });

  useEffect(() => {
    if (profile) {
      setAnswers((prev) => {
        const defaults = getInitialAnswers(profile as any);
        // only fill empty slots so user edits aren't overwritten
        const merged: Record<string, string> = { ...defaults };
        Object.keys(prev).forEach((k) => { if (prev[k]) merged[k] = prev[k]; });
        return merged;
      });
    }
  }, [profile]);

  const current = STEPS[step];
  const text = answers[current.key] ?? '';
  const setText = (val: string) => setAnswers((a) => ({ ...a, [current.key]: val }));

  const invalidateProfile = () => queryClient.invalidateQueries({ queryKey: ['profile'] });

  const textMutation = useMutation({
    mutationFn: ({ answer, stepKey }: { answer: string; stepKey: string }) =>
      onboardingApi.saveStep(stepKey, answer),
    onSuccess: () => { invalidateProfile(); goNext(); },
  });

  const voiceMutation = useMutation({
    mutationFn: ({ audioUri, stepKey }: { audioUri: string; stepKey: string }) =>
      onboardingApi.voiceStep(stepKey, audioUri),
    onSuccess: () => { invalidateProfile(); goNext(); },
  });

  const skipMutation = useMutation({
    mutationFn: (stepKey: string) => onboardingApi.saveStep(stepKey),
    onSuccess: () => { invalidateProfile(); goNext(); },
  });

  const goNext = () => {
    recorder.reset();
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      if (canClose) {
        navigation.goBack();
      } else {
        navigation.replace('Chat');
      }
    }
  };

  const isLast = step === STEPS.length - 1;
  const isLoading = textMutation.isPending || voiceMutation.isPending || skipMutation.isPending;

  const handleSendText = () => {
    if (text.trim()) {
      textMutation.mutate({ answer: text.trim(), stepKey: current.key });
    }
  };

  const handleStopRecording = async () => {
    const uri = await recorder.stop();
    if (uri) voiceMutation.mutate({ audioUri: uri, stepKey: current.key });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.root, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {canClose && (
          <Pressable
            style={styles.closeBtn}
            hitSlop={16}
            onPress={async () => {
              if (text.trim()) {
                await onboardingApi.saveStep(current.key, text.trim());
                queryClient.invalidateQueries({ queryKey: ['profile'] });
              }
              navigation.goBack();
            }}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        )}

        <View style={styles.progress}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
          ))}
        </View>

        <Text style={styles.question}>{current.question}</Text>
        <Text style={styles.hint}>{current.hint}</Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, inputMode === 'text' && styles.modeBtnActive]}
            onPress={() => setInputMode('text')}
          >
            <Text style={[styles.modeBtnText, inputMode === 'text' && styles.modeBtnTextActive]}>
              ✏️ Текст
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, inputMode === 'voice' && styles.modeBtnActive]}
            onPress={() => setInputMode('voice')}
          >
            <Text style={[styles.modeBtnText, inputMode === 'voice' && styles.modeBtnTextActive]}>
              🎙 Голос
            </Text>
          </Pressable>
        </View>

        {inputMode === 'text' ? (
          <View style={styles.textInputRow}>
            <TextInput
              style={styles.textInput}
              placeholder={current.placeholder}
              placeholderTextColor={colors.textMuted}
              multiline
              value={text}
              onChangeText={setText}
              returnKeyType="default"
            />
            <Button
              title="Сохранить"
              onPress={handleSendText}
              loading={textMutation.isPending}
              disabled={!text.trim()}
            />
          </View>
        ) : (
          <View style={styles.voiceRow}>
            <VoiceButton
              state={recorder.state}
              onPressIn={recorder.start}
              onPressOut={handleStopRecording}
            />
            <Text style={styles.voiceHint}>
              {recorder.state === 'recording'
                ? 'Говори...'
                : recorder.state === 'done'
                ? 'Готово, отправляю...'
                : 'Удержи чтобы говорить'}
            </Text>
          </View>
        )}

        <Button
          title={isLast ? (canClose ? 'Готово' : 'Начать общение') : 'Пропустить'}
          variant="ghost"
          onPress={() => skipMutation.mutate(current.key)}
          loading={skipMutation.isPending}
          disabled={isLoading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.xl + spacing.lg,
    right: spacing.xl,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  progress: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent },
  question: { ...typography.h2, textAlign: 'center' },
  hint: { ...typography.bodySmall, textAlign: 'center', color: colors.textMuted },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  modeBtnText: { ...typography.bodySmall, color: colors.textSecondary },
  modeBtnTextActive: { color: colors.accent, fontWeight: '600' },
  textInputRow: { gap: spacing.sm },
  textInput: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  voiceRow: { alignItems: 'center', gap: spacing.sm },
  voiceHint: { ...typography.caption, color: colors.textSecondary },
});
