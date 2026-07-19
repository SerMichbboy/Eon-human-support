import { Ionicons } from '@expo/vector-icons';
import { Canvas, Fill, Shader, Skia, useClock, type Uniforms } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo } from 'react';
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

// A real per-pixel lit sphere, not a flat gradient circle — that's what was
// missing "volume". `main` treats the disc as a hemisphere impostor
// (z = sqrt(1 - x² - y²), the standard trick for faking a 3D sphere's
// surface normal from a 2D silhouette without an actual mesh), then does
// simple diffuse + specular (Blinn-Phong-ish) lighting against that normal —
// bright where the surface faces the light, dark falloff around the rim,
// same "brightest facing the light, fading around the sides" logic as
// `GlassRim`'s contour stroke, just filled instead of stroked. A few
// slow, out-of-phase sine harmonics perturb the silhouette radius by angle
// so the edge breathes like a liquid drop instead of a rigid circle, and the
// light direction drifts gently over time so the highlight never sits
// perfectly still. `spec`/`sparkle` are two specular lobes at different
// exponents (tight highlight + a hotter, tighter glint inside it) for a
// glossy, wet-looking surface rather than a matte one.
const sksl = `
uniform float2 resolution;
uniform float time;
uniform float3 colorDeep;
uniform float3 colorBright;
uniform float3 colorWarm;

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - resolution * 0.5) / (resolution.y * 0.5);

  float ang = atan(uv.y, uv.x);
  float wobble =
    sin(ang * 3.0 + time * 0.7) * 0.015 +
    sin(ang * 5.0 - time * 0.5) * 0.010 +
    sin(ang * 2.0 + time * 0.3) * 0.012;
  float edge = 1.0 + wobble;

  float r = length(uv);
  if (r > edge) {
    return half4(0.0);
  }

  float rn = min(r / edge, 1.0);
  float z = sqrt(max(0.0, 1.0 - rn * rn));
  float3 normal = normalize(float3(uv, z));

  float3 lightDir = normalize(float3(
    -0.55 + 0.12 * sin(time * 0.35),
    -0.6 + 0.10 * cos(time * 0.28),
    0.55
  ));
  float diff = max(dot(normal, lightDir), 0.0);
  float spec = pow(diff, 40.0);
  float sparkle = pow(diff, 140.0) * 1.4;

  float3 base = mix(colorDeep, colorBright, pow(diff, 0.85));
  float rim = pow(1.0 - z, 2.6);
  float3 col = base + (spec + sparkle) * float3(1.0) + rim * colorWarm * 0.55;

  float a = 1.0 - smoothstep(edge - 0.035, edge, r);
  return half4(col, 1.0) * a;
}
`;

const orbEffect = Skia.RuntimeEffect.Make(sksl)!;

function hexToRgb01(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/** The lit sphere itself. `time` is `useClock()`'s Reanimated shared value
 * fed straight into the shader's `time` uniform — Skia subscribes to shared
 * values anywhere in the props tree (including nested inside `uniforms`)
 * and re-runs the draw worklet on the UI thread each frame, no JS re-renders
 * involved. The library's own TS types only model the top-level `uniforms`
 * prop as animatable, not values nested inside it, so the object is cast
 * through `Uniforms` at the call site — a known gap between what the types
 * describe and what the native binding actually supports. */
function VoiceOrbCore({ accent, accentWarm }: { accent: string; accentWarm: string }) {
  const time = useClock();

  const uniforms = useMemo(() => {
    const bright = hexToRgb01(accent);
    const deep: [number, number, number] = [bright[0] * 0.3, bright[1] * 0.3, bright[2] * 0.3];
    const warm = hexToRgb01(accentWarm);
    return {
      resolution: [CORE_SIZE, CORE_SIZE],
      time,
      colorDeep: deep,
      colorBright: bright,
      colorWarm: warm,
    };
  }, [accent, accentWarm]);

  return (
    <Canvas style={{ width: CORE_SIZE, height: CORE_SIZE }}>
      <Fill>
        <Shader source={orbEffect} uniforms={uniforms as unknown as Uniforms} />
      </Fill>
    </Canvas>
  );
}

/** The "listening" orb — styled after ChatGPT's/Siri's voice-mode sphere
 * (a glowing, volumetric orb breathing at screen center) but built from this
 * app's own accent/accentWarm tokens rather than a copied blue. Two layers:
 *  - `halo`: a big, very soft SVG radial falloff bleeding out from the
 *    sphere — standing in for the ambient glow a real emissive material
 *    would cast onto its surroundings.
 *  - `core`: `VoiceOrbCore` above, an actual per-pixel-lit Skia shader
 *    sphere — this is what gives it real volume instead of a flat painted
 *    gradient circle. Wrapped in an outer breathe/wobble transform (macro
 *    scale + non-uniform scaleX/scaleY) *on top of* the shader's own
 *    per-pixel silhouette wobble, so there are two independent scales of
 *    motion (whole-body breathing, surface-level liquid morph) instead of
 *    one mechanical pulse. */
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
        <VoiceOrbCore accent={accent} accentWarm={accentWarm} />
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
      style={StyleSheet.absoluteFillObject}
    >
      <Pressable style={styles.fill} onPress={onSave}>
        <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, opacity: isDark ? 0.65 : 0.5 }]} />

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
