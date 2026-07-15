import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { apiClient } from '@/shared/api/client';
import { Button } from '@/shared/components/Button';
import { TouchRipple, TouchRippleHandle } from '@/shared/components/TouchRipple';
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
    question: 'Если однажды станет тяжело — что обычно помогает тебе в такие моменты?',
    hint: 'Необязательно рассказывать всё — просто чтобы я знал, как быть рядом полезнее',
    placeholder: 'Например: прогулки, музыка, разговор с кем-то близким...',
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [seconds, setSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorder = useAudioRecorder();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rippleRef = useRef<TouchRippleHandle>(null);

  const isRecordingActive = recorder.state === 'recording' || recorder.state === 'locked';
  const isRecordingActiveRef = useRef(isRecordingActive);
  useEffect(() => { isRecordingActiveRef.current = isRecordingActive; }, [isRecordingActive]);

  useEffect(() => {
    if (isRecordingActive) {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecordingActive]);

  // Swipe between steps — same whole-area PanResponder pattern as Chat/
  // Settings/Profile (capture phase, axis-dominance so it doesn't fight the
  // ScrollView's vertical scroll or the TextInput). Disabled while actively
  // recording, since the recording isn't step-scoped and switching questions
  // mid-recording would be confusing. This only moves the local `step`
  // pointer — same as the existing dot-progress navigation — it doesn't
  // save anything, so answers already typed on other steps are preserved.
  const stepPan = useMemo(() => {
    const isHorizontalDrag = (g: { dx: number; dy: number }) =>
      !isRecordingActiveRef.current && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 12;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => isHorizontalDrag(g),
      onMoveShouldSetPanResponder: (_, g) => isHorizontalDrag(g),
      onPanResponderGrant: (evt) => {
        rippleRef.current?.triggerAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderMove: (evt) => {
        rippleRef.current?.moveTo(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderRelease: (_, g) => {
        rippleRef.current?.release();
        if (g.dx < -50) setStep((s) => Math.min(s + 1, STEPS.length - 1));
        else if (g.dx > 50) setStep((s) => Math.max(s - 1, 0));
      },
      onPanResponderTerminate: () => {
        rippleRef.current?.release();
      },
    });
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
  const isLoading = textMutation.isPending || skipMutation.isPending;

  const handleSendText = () => {
    if (text.trim()) textMutation.mutate({ answer: text.trim(), stepKey: current.key });
  };

  // Transcribes into the text field instead of saving directly — the user
  // gets to see and edit what was heard before it's committed with the same
  // "Сохранить" flow as typed text, rather than trusting a raw transcription
  // straight to the profile.
  const handleStopRecording = async () => {
    const uri = await recorder.stop();
    if (!uri) return;
    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append('audio', { uri, name: 'audio.wav', type: 'audio/wav' } as any);
      const { data } = await apiClient.post<{ text: string }>('/voice/transcribe', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.text) setText(data.text);
    } finally {
      setIsTranscribing(false);
      recorder.reset();
    }
  };

  return (
    <View style={{ flex: 1 }} {...stepPan.panHandlers}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isRecordingActive}
        bounces={false}
        overScrollMode="never"
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
            <Ionicons name="close-outline" size={20} color={colors.textSecondary} />
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

        <Animated.View key={step} entering={FadeIn.duration(250)} style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <Text style={[styles.question, { color: colors.textPrimary }]}>{current.question}</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>{current.hint}</Text>
        </View>

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
                    selected && { backgroundColor: colors.accentMuted },
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
        ) : (
          <View style={styles.textInputRow}>
            {recorder.state === 'locked' ? (
              <View style={styles.lockedRow}>
                <Pressable
                  style={[styles.roundBtn, { backgroundColor: colors.bgInput, borderColor: colors.border }]}
                  onPress={recorder.cancel}
                >
                  <Ionicons name="close-outline" size={18} color={colors.textMuted} />
                </Pressable>
                <Text style={[styles.voiceHint, { color: colors.textPrimary }]}>
                  Запись идёт · {formatTime(seconds)}
                </Text>
                <Pressable
                  style={[styles.roundBtn, styles.roundBtnSend, { backgroundColor: colors.accent }]}
                  onPress={handleStopRecording}
                >
                  <Ionicons name="arrow-up-outline" size={20} color={colors.onAccent} />
                </Pressable>
              </View>
            ) : (
              // Text field is always here — voice is just an inline mic
              // button beside it, not a separate mode. Recording (tap-hold,
              // slide up to lock) transcribes into this same field on
              // release instead of submitting directly, so it can be
              // reviewed/edited before "Сохранить".
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.bgCard, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder={isTranscribing ? 'Распознаю голос...' : current.placeholder}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={text}
                  onChangeText={setText}
                  editable={!isTranscribing}
                  returnKeyType="default"
                />
                {isTranscribing ? (
                  <View style={styles.voiceBtnSlot}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : (
                  <VoiceButton
                    state={recorder.state}
                    onPressIn={recorder.start}
                    onPressOut={handleStopRecording}
                    onLock={recorder.lock}
                  />
                )}
              </View>
            )}
            <Button
              title="Сохранить"
              onPress={handleSendText}
              loading={textMutation.isPending}
              disabled={!text.trim() || isTranscribing || recorder.state === 'locked'}
            />
          </View>
        )}
        </Animated.View>

        <Button
          title={isLast ? (canClose ? 'Готово' : 'Начать общение') : 'Пропустить'}
          variant="ghost"
          onPress={() => skipMutation.mutate(current.key)}
          loading={skipMutation.isPending}
          disabled={isLoading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
    <TouchRipple ref={rippleRef} />
    </View>
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
  progress: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  question: { ...typography.h2, textAlign: 'center' },
  hint: { ...typography.bodySmall, textAlign: 'center' },
  // Question + hint are one unit (title + its own subtitle) — a tight gap
  // groups them, distinct from the larger gap stepContent gives before the
  // actual input area. Same gap for both would flatten that hierarchy and
  // read as one undifferentiated stack instead of "header, then content."
  stepHeader: { gap: spacing.xs },
  stepContent: { gap: spacing.xl },
  textInputRow: { gap: spacing.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    ...typography.body,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  voiceBtnSlot: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  voiceHint: { ...typography.caption, textAlign: 'center' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnSend: { borderWidth: 0 },
  stylePickerCol: { gap: spacing.sm },
  styleCard: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 4,
  },
  styleLabel: { ...typography.bodySemibold },
  styleDesc: { ...typography.bodySmall },
});
