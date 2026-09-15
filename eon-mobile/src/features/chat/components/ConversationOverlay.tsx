import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { BlurView } from 'expo-blur';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSettingsStore } from '@/shared/store/settings';
import { useColors, spacing, spring, typography, radius } from '@/shared/theme';
import { voiceApi } from '@/features/voice/api';
import { useAudioRecorder } from '@/features/voice/hooks/useAudioRecorder';
import { ChatMessage } from '../hooks/useChat';

interface Props {
  messages: ChatMessage[];
  send: (text: string, voiceMode?: boolean) => void;
  onClose: () => void;
}

type Phase = 'listening' | 'thinking' | 'speaking';

const overlayFadeIn = FadeIn.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass);
const overlayFadeOut = FadeOut.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass);

const ORB_SIZE = 220;
const CORE_SIZE = Math.round(ORB_SIZE * 0.62);

const HINTS: Record<Phase, string> = {
  listening: 'Слушаю — нажми, когда закончишь',
  thinking: 'Eon думает…',
  speaking: 'Eon говорит — нажми, чтобы перебить',
};

/** Same halo+core SVG orb as onboarding's `RecordingOverlay` — kept as its
 * own copy rather than a shared import since this one needs a `phase`-driven
 * look (dimmer/slower while `thinking`, livelier while `speaking`) that the
 * onboarding version, with only one state, doesn't. */
function Orb({ phase, accent, accentWarm }: { phase: Phase; accent: string; accentWarm: string }) {
  const breathe = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    const duration = phase === 'speaking' ? 900 : phase === 'thinking' ? 1800 : 2600;
    breathe.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    drift.value = withRepeat(withTiming(1, { duration: duration * 1.6, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [phase]);

  const scaleRange: [number, number] = phase === 'thinking' ? [0.96, 1.02] : phase === 'speaking' ? [0.92, 1.1] : [0.94, 1.06];
  const opacityRange: [number, number] = phase === 'thinking' ? [0.5, 0.7] : [0.4, 0.75];

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [0, 1], opacityRange),
    transform: [{ scale: interpolate(drift.value, [0, 1], [1, 1.12]) }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breathe.value, [0, 1], scaleRange) }],
  }));

  return (
    <View style={styles.orbWrap} pointerEvents="none">
      <Animated.View style={[styles.orbHalo, haloStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={accent} stopOpacity={0.5} />
              <Stop offset="0.6" stopColor={accent} stopOpacity={0.12} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill="url(#halo)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.orbCore, coreStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="core" cx="34%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="0.35" stopColor={accent} stopOpacity={0.95} />
              <Stop offset="1" stopColor={accentWarm} stopOpacity={0.92} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill="url(#core)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Hands-free "walkie-talkie" loop: record → transcribe → send over the
 * existing chat WS → wait for the reply → synthesize it → play it → listen
 * again. Not a real low-latency voice mode (see CLAUDE.md) — each turn is
 * three sequential HTTP round-trips (STT, chat, TTS), so there's a
 * multi-second "thinking" pause every turn. Tapping the orb means "I'm done
 * talking" while listening, or "let me talk" (stops playback) while Eon is
 * speaking — a lightweight stand-in for real barge-in interruption. */
export function ConversationOverlay({ messages, send, onClose }: Props) {
  const colors = useColors();
  const isDark = useSettingsStore((s) => s.themeValue) < 0.5;
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<Phase>('listening');
  const [seconds, setSeconds] = useState(0);
  const pendingBaselineRef = useRef<number | null>(null);
  const soundRef = useRef<AudioPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    recorder.start();
    return () => {
      closingRef.current = true;
      recorder.reset();
      soundRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'listening') {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // The reply comes back asynchronously over the chat WS, not as a return
  // value from `send()` — so instead of awaiting anything, we note how many
  // messages existed right before sending and watch for two more to land
  // (the just-sent user message, then the assistant's reply).
  useEffect(() => {
    if (phase !== 'thinking' || pendingBaselineRef.current === null) return;
    if (messages.length >= pendingBaselineRef.current + 2) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') {
        pendingBaselineRef.current = null;
        playReply(last.content);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, phase]);

  const playReply = async (text: string) => {
    setPhase('speaking');
    try {
      const uri = await voiceApi.synthesize(text);
      if (closingRef.current) return;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const player = createAudioPlayer({ uri });
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          subscription.remove();
          player.remove();
          soundRef.current = null;
          if (!closingRef.current) {
            setPhase('listening');
            recorder.start();
          }
        }
      });
      player.play();
      soundRef.current = player;
    } catch {
      if (!closingRef.current) {
        setPhase('listening');
        recorder.start();
      }
    }
  };

  const handleStopAndSend = async () => {
    const uri = await recorder.stop();
    setPhase('thinking');
    if (!uri) { setPhase('listening'); recorder.start(); return; }
    try {
      const text = await voiceApi.transcribe(uri);
      recorder.reset();
      if (!text.trim()) {
        setPhase('listening');
        recorder.start();
        return;
      }
      pendingBaselineRef.current = messages.length;
      send(text, true);
    } catch {
      setPhase('listening');
      recorder.start();
    }
  };

  const handleInterrupt = async () => {
    if (!soundRef.current) return;
    soundRef.current.remove();
    soundRef.current = null;
    setPhase('listening');
    recorder.start();
  };

  const handleTap = () => {
    if (phase === 'listening') handleStopAndSend();
    else if (phase === 'speaking') handleInterrupt();
  };

  const handleClose = async () => {
    closingRef.current = true;
    recorder.reset();
    soundRef.current?.remove();
    onClose();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Animated.View entering={overlayFadeIn} exiting={overlayFadeOut} style={StyleSheet.absoluteFill}>
      <Pressable style={styles.fill} onPress={handleTap}>
        <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: isDark ? 0.65 : 0.5 }]} />

        <View style={styles.center}>
          {phase === 'listening' && (
            <Text style={[styles.timer, { color: colors.textPrimary }]}>{formatTime(seconds)}</Text>
          )}
          <Orb phase={phase} accent={colors.accent} accentWarm={colors.accentWarm} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{HINTS[phase]}</Text>
        </View>

        <Pressable
          style={[styles.cancelBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          hitSlop={16}
          onPress={handleClose}
        >
          <Ionicons name="close-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, paddingHorizontal: spacing.xl },
  timer: { ...typography.h1, fontVariant: ['tabular-nums'] },
  hint: { ...typography.body, textAlign: 'center' },
  orbWrap: { width: ORB_SIZE, height: ORB_SIZE, alignItems: 'center', justifyContent: 'center' },
  orbHalo: { position: 'absolute', width: ORB_SIZE, height: ORB_SIZE },
  orbCore: { width: CORE_SIZE, height: CORE_SIZE, borderRadius: CORE_SIZE / 2, overflow: 'hidden' },
  cancelBtn: {
    position: 'absolute',
    top: spacing.xl + spacing.lg,
    right: spacing.xl,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
