import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect } from 'react';
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

interface Props {
  seconds: number;
  onSave: () => void;
  onCancel: () => void;
}

const overlayFadeIn = FadeIn.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass);
const overlayFadeOut = FadeOut.springify().damping(spring.gentle.damping).stiffness(spring.gentle.stiffness).mass(spring.gentle.mass);

const ORB_SIZE = 220;
const CORE_SIZE = Math.round(ORB_SIZE * 0.62);

/** The "listening" orb — styled after ChatGPT's/Siri's voice-mode sphere
 * (a glowing orb breathing at screen center) but built from this app's own
 * accent/accentWarm tokens rather than a copied blue. Two layers:
 *  - `halo`: a big, very soft SVG radial falloff bleeding out from the
 *    sphere — standing in for the ambient glow a real emissive material
 *    would cast onto its surroundings.
 *  - `core`: a smaller radial-gradient circle with an off-center highlight,
 *    reading as a lit sphere rather than a flat wash.
 * A previous version of `core` was a real per-pixel-lit `@shopify/react-native-skia`
 * shader (a hemisphere-impostor sphere with diffuse+specular lighting) — pulled
 * because it (a) needs a rebuilt dev client to actually run (plain Expo Go
 * doesn't bundle Skia's native module, so the app crashed the moment this
 * screen tried to mount a `Canvas`), and (b) was already rejected on looks
 * ("не то визуально") before the crash was even reported. Reverted to plain
 * `react-native-svg`, which every other themed surface in this app already
 * depends on and is known to work without a native rebuild. If a real 3D
 * sphere gets revisited, it needs a dev-client build, not just `expo start`. */
function VoiceOrb({ accent, accentWarm }: { accent: string; accentWarm: string }) {
  const breathe = useSharedValue(0);
  const wobble = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    wobble.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
    drift.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [0, 1], [0.4, 0.7]),
    transform: [{ scale: interpolate(drift.value, [0, 1], [1, 1.12]) }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(breathe.value, [0, 1], [0.94, 1.06]) },
      { scaleX: interpolate(wobble.value, [0, 1], [1, 1.05]) },
      { scaleY: interpolate(wobble.value, [0, 1], [1, 0.96]) },
    ],
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

/** Full-screen "listening" scene shown once recording is locked (hands-free)
 * — replaces the old compact in-row locked UI. A small in-row indicator made
 * sense when it sat next to the input the user was about to come back to;
 * a full-screen surface makes more sense for a hands-free, no-active-touch
 * state, and gives the tap-anywhere-to-save gesture room to exist without a
 * tiny hit target. Only shown once actually locked (mirrors the
 * `showLockedUI` delay in OnboardingScreen) — while the finger is still on
 * the mic button dragging, this must stay out of the way of that gesture. */
export function RecordingOverlay({ seconds, onSave, onCancel }: Props) {
  const colors = useColors();
  const isDark = useSettingsStore((s) => s.themeValue) < 0.5;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Animated.View
      entering={overlayFadeIn}
      exiting={overlayFadeOut}
      style={StyleSheet.absoluteFill}
    >
      <Pressable style={styles.fill} onPress={onSave}>
        <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: isDark ? 0.65 : 0.5 }]} />

        <View style={styles.center}>
          <Text style={[styles.timer, { color: colors.textPrimary }]}>{formatTime(seconds)}</Text>
          <VoiceOrb accent={colors.accent} accentWarm={colors.accentWarm} />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Нажми в любом месте, чтобы сохранить</Text>
        </View>

        <Pressable
          style={[styles.cancelBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
          hitSlop={16}
          onPress={onCancel}
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
