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
import { useColors, radius, spacing, typography } from '@/shared/theme';
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
    question: 'Как я должен общаться с тобой?',
    hint: 'Ты всегда сможешь изменить это в настройках',
    placeholder: '',
  },
];

const STYLE_OPTIONS = [
  { id: 'listener', label: 'Слушатель',  desc: 'Просто слушает, не торопится с советами' },
  { id: 'friend',   label: 'Друг',       desc: 'Тепло и естественно, советует когда просят' },
  { id: 'mentor',   label: 'Наставник',  desc: 'Прямо и по существу, помогает расти' },
  { id: 'mirror',   label: 'Зеркало',    desc: 'Задаёт вопросы, помогает думать самому' },
  { id: 'debater',  label: 'Полемик',    desc: 'Держит позицию, честный диалог' },
];

function getInitialAnswers(profile: ReturnType<typeof profileApi.get> extends Promise<infer T> ? T extends { data: infer D } ? D : never : never | null | undefined): Record<string, string> {
  if (!profile) return {};
  return {
    intro: profile.basic_info?.preferred_name ?? '',
    life_context: profile.life_context?.occupation ?? '',
    positive_moments: profile.positive_moments?.sources_of_energy?.join('\n') ?? '',
    struggles: profile.struggles?.coping_mechanisms?.join('\n') ?? '',
    companion_preferences: profile.companion_preferences?.communication_style ?? '',
  };
}

export function OnboardingScreen({ navigation }: Props) {
  const colors = useColors();
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
      if (canClose) navigation.goBack();
      else navigation.replace('Chat');
    }
  };

  const isLast = step === STEPS.length - 1;
  const isLoading = textMutation.isPending || voiceMutation.isPending || skipMutation.isPending;

  const handleSendText = () => {
    if (text.trim()) textMutation.mutate({ answer: text.trim(), stepKey: current.key });
  };

  const handleStopRecording = async () => {
    const uri = await recorder.stop();
    if (uri) voiceMutation.mutate({ audioUri: uri, stepKey: current.key });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {canClose && (
          <Pressable
            style={[styles.closeBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            hitSlop={16}
            onPress={async () => {
              if (text.trim()) {
                await onboardingApi.saveStep(current.key, text.trim());
                queryClient.invalidateQueries({ queryKey: ['profile'] });
              }
              navigation.goBack();
            }}
          >
            <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        )}

        <View style={styles.progress}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: i <= step ? colors.accent : colors.border }]}
            />
          ))}
        </View>

        <Text style={[styles.question, { color: colors.textPrimary }]}>{current.question}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{current.hint}</Text>

        {current.key !== 'companion_preferences' && (
          <View style={styles.modeRow}>
            {(['text', 'voice'] as const).map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.modeBtn,
                  { borderColor: inputMode === m ? colors.accent : colors.border },
                  inputMode === m && { backgroundColor: colors.accentMuted },
                ]}
                onPress={() => setInputMode(m)}
              >
                <Text style={[styles.modeBtnText, { color: inputMode === m ? colors.accent : colors.textSecondary }]}>
                  {m === 'text' ? '✏️ Текст' : '🎙 Голос'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {current.key === 'companion_preferences' ? (
          <View style={styles.stylePickerCol}>
            {STYLE_OPTIONS.map((opt) => {
              const selected = text === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.styleCard,
                    { borderColor: selected ? colors.accent : colors.border },
                    selected && { backgroundColor: colors.accentMuted + '22' },
                  ]}
                  onPress={() => {
                    setText(opt.id);
                    textMutation.mutate({ answer: opt.id, stepKey: current.key });
                  }}
                >
                  <Text style={[styles.styleLabel, { color: selected ? colors.accent : colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.styleDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : inputMode === 'text' ? (
          <View style={styles.textInputRow}>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
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
              onLock={recorder.lock}
            />
            <Text style={[styles.voiceHint, { color: colors.textSecondary }]}>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 15, lineHeight: 18 },
  progress: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  question: { ...typography.h2, textAlign: 'center' },
  hint: { ...typography.bodySmall, textAlign: 'center' },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeBtnText: { ...typography.bodySmall, fontWeight: '500' },
  textInputRow: { gap: spacing.sm },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    ...typography.body,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  voiceRow: { alignItems: 'center', gap: spacing.sm },
  voiceHint: { ...typography.caption },
  stylePickerCol: { gap: spacing.sm },
  styleCard: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 4,
  },
  styleLabel: { ...typography.body, fontWeight: '600' },
  styleDesc: { ...typography.bodySmall },
});
