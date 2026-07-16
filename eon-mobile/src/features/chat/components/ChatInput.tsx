import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors, radius, spacing, spring, typography } from '@/shared/theme';
import { VoiceButton } from '@/features/voice/components/VoiceButton';
import { useAudioRecorder } from '@/features/voice/hooks/useAudioRecorder';
import { apiClient } from '@/shared/api/client';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  onRecordingActiveChange?: (active: boolean) => void;
}

// Spring-based, not timing-based — matches the `spring.gentle` "personality"
// used everywhere else motion happens in this app, instead of a fixed linear
// duration that feels mechanical next to it. Builder instances are safe to
// reuse across multiple Animated.View usages (Reanimated reads the config
// when a view mounts/unmounts, no shared mutable per-instance state).
const rowFadeIn = FadeIn.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass);
const rowFadeOut = FadeOut.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass);

export function ChatInput({ onSend, disabled, onRecordingActiveChange }: Props) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recorder = useAudioRecorder();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotOpacity = useSharedValue(1);

  const isLocked = recorder.state === 'locked';
  const isRecording = recorder.state === 'recording' || isLocked;

  // Lets ChatScreen block the header swipe/nav-button escape hatch while a
  // recording is in flight — recorder state lives here, not in the screen,
  // so the screen has no other way to know.
  useEffect(() => { onRecordingActiveChange?.(isRecording); }, [isRecording]);

  // The row-swap used to trigger the instant `isLocked` flips — which
  // happens *while the slide-up-to-lock drag is still in flight*, not after
  // it settles. Swapping the whole bar's content out from under a gesture
  // that's still physically happening (finger still moving, or just barely
  // released) is what actually read as jerky — no amount of smoothing the
  // fade itself fixes a transition that starts at the wrong moment. Waiting
  // a beat lets the drag settle (VoiceButton's own spring-back finishes,
  // finger has typically already lifted) before the surrounding UI changes
  // shape. VoiceButton's *own* visual state (lock icon, accent color) still
  // reacts to the real `recorder.state` immediately — that's fine, it's
  // local feedback on the thing you're actually touching, not a full
  // layout change happening elsewhere on screen.
  const [showLockedUI, setShowLockedUI] = useState(false);
  useEffect(() => {
    if (isLocked) {
      const t = setTimeout(() => setShowLockedUI(true), 280);
      return () => clearTimeout(t);
    }
    setShowLockedUI(false);
  }, [isLocked]);

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

  // One bar, not two separate returns — the old version fully unmounted the
  // normal bar (TextInput + VoiceButton) and mounted a completely different
  // "locked" tree the instant isLocked flipped, an abrupt cut with no
  // transition. It also cut VoiceButton's own spring-back animation off
  // mid-flight, since the component unmounting killed that in-flight
  // animation outright. Keeping one bar and crossfading just the *contents*
  // (keyed Animated.View, entering/exiting) makes the lock transition a
  // smooth swap instead of an instant jump.
  return (
    <View style={[styles.bar, { backgroundColor: colors.bgCard, borderColor: colors.accent, shadowColor: colors.accent }]}>
      {showLockedUI ? (
        // Absolutely positioned — the locked row doesn't drive the bar's
        // height (it never needs more than one line), so during the
        // crossfade the bar's height stays governed by whichever exiting/
        // entering *normal* content is present, and this just overlays.
        <Animated.View key="locked" entering={rowFadeIn} exiting={rowFadeOut} style={[styles.barContent, styles.barContentLocked]}>
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
        </Animated.View>
      ) : (
        <Animated.View key="normal" entering={rowFadeIn} exiting={rowFadeOut} style={styles.barContent}>
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
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    minHeight: 60,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  barContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  barContentLocked: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
