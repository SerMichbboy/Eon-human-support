import { BlurView } from 'expo-blur';
import React, { ReactNode, useEffect, useId } from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useSettingsStore } from '@/shared/store/settings';
import { MaterialLevel, radius } from '@/shared/theme';
import { darkMaterial, lightMaterial } from '@/shared/theme/material';
import { useAnimatedThemeValue } from '@/shared/theme/ThemeAnimation';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  level?: MaterialLevel;
  borderRadius?: number;
}

interface GlassPanelProps extends ViewProps {
  children: ReactNode;
  level?: MaterialLevel;
}

/**
 * Rim light tracing the shape's own contour, not a wash over the interior.
 * A top-to-bottom linear gradient stroke naturally reads as "brightest where
 * the surface faces the light, fading around the sides" — which is what a
 * real specular highlight on curved glass looks like (see CLAUDE.md's Liquid
 * Glass notes). White-on-near-black (dark theme) reads as a glass sheen; the
 * same white is invisible on light-theme's near-white cards, and colored
 * tints there read as a stain rather than light — so this is dark-theme only.
 */
function GlassRim({ borderRadius = 0 }: { borderRadius?: number }) {
  const gradId = useId();

  // Slow, gentle breathing (not positional movement — a stroke tracing the
  // exact contour has no "safe" direction to slide without briefly exposing
  // a gap at the seam, which is exactly what a translating rectangle did).
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);
  const breatheStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + breathe.value * 0.25,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, breatheStyle]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
            <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.12} />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          rx={borderRadius}
          ry={borderRadius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={1.5}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Overlay/border/shadow all read the shared UI-thread theme value (see
 * `ThemeAnimation.tsx`) and interpolate via `interpolateColor`/`interpolate`
 * inside the worklet — the crossfade runs on the UI thread with zero JS
 * re-renders, which matters here because `Glass` wraps a `BlurView` and is
 * the single most-repeated component in the app (every card, every header).
 * `blurIntensity` is deliberately *not* animated: dark/light specs use
 * identical values per level, so it's a plain constant.
 */
function useOverlayStyle(level: MaterialLevel) {
  const av = useAnimatedThemeValue();
  const d = darkMaterial[level];
  const l = lightMaterial[level];
  return useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(av.value, [0, 1], [d.overlay, l.overlay]),
    borderColor: interpolateColor(av.value, [0, 1], [d.border, l.border]),
  }));
}

function useBottomBorderStyle(level: MaterialLevel) {
  const av = useAnimatedThemeValue();
  const d = darkMaterial[level];
  const l = lightMaterial[level];
  return useAnimatedStyle(() => ({
    borderBottomColor: interpolateColor(av.value, [0, 1], [d.bottomBorder, l.bottomBorder]),
  }));
}

function useShadowStyle(level: MaterialLevel) {
  const av = useAnimatedThemeValue();
  const d = darkMaterial[level];
  const l = lightMaterial[level];
  return useAnimatedStyle(() => ({
    shadowColor: interpolateColor(av.value, [0, 1], [d.shadowColor, l.shadowColor]),
    shadowOpacity: interpolate(av.value, [0, 1], [d.shadowOpacity, l.shadowOpacity]),
    shadowRadius: interpolate(av.value, [0, 1], [d.shadowRadius, l.shadowRadius]),
  }));
}

/**
 * GlassCard — rounded card with shadow and blur background.
 * `style` controls the content container layout (padding, size, gap).
 * Shadow is on the outer wrapper so overflow:hidden on the inner clip doesn't cut it.
 */
export function GlassCard({ children, style, level = 'regular', borderRadius = radius.sm }: GlassCardProps) {
  const isDark = useSettingsStore((s) => s.themeValue) < 0.5;
  const shadowStyle = useShadowStyle(level);
  const overlayStyle = useOverlayStyle(level);
  const blurIntensity = darkMaterial[level].blurIntensity;

  return (
    <Animated.View style={[styles.shadow, { borderRadius }, shadowStyle]}>
      {/* clip: keeps blur + border inside rounded corners; receives all layout styles */}
      <View style={[styles.clip, { borderRadius }, style]}>
        <BlurView
          intensity={blurIntensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[StyleSheet.absoluteFill, { borderRadius, borderWidth: 1 }, overlayStyle]}
        />
        {isDark && <GlassRim borderRadius={borderRadius} />}
        {children}
      </View>
    </Animated.View>
  );
}

/**
 * GlassPanel — full-width bar for headers / status bars.
 * Accepts all ViewProps (including panHandlers) and forwards them to the layout View.
 * `style` carries all layout (flexDirection, padding, paddingTop, etc).
 * Blur and overlay are absolute so they don't break flex layout.
 */
export function GlassPanel({ children, style, level = 'thick', ...rest }: GlassPanelProps) {
  const isDark = useSettingsStore((s) => s.themeValue) < 0.5;
  const overlayStyle = useOverlayStyle(level);
  const bottomBorderStyle = useBottomBorderStyle(level);
  const blurIntensity = darkMaterial[level].blurIntensity;

  return (
    <View style={[styles.panel, style]} {...rest}>
      <BlurView
        intensity={blurIntensity}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} />
      {isDark && <GlassRim />}
      <Animated.View style={[styles.panelBorder, bottomBorderStyle]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  clip: { overflow: 'hidden' },
  panel: { overflow: 'hidden' },
  panelBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
