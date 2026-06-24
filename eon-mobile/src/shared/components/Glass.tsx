import { BlurView } from 'expo-blur';
import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { useSettingsStore } from '@/shared/store/settings';
import { glass, radius } from '@/shared/theme';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  borderRadius?: number;
}

interface GlassPanelProps extends ViewProps {
  children: ReactNode;
  intensity?: number;
}

/**
 * GlassCard — rounded card with shadow and blur background.
 * `style` controls the content container layout (padding, size, gap).
 * Shadow is on the outer wrapper so overflow:hidden on the inner clip doesn't cut it.
 */
export function GlassCard({ children, style, intensity, borderRadius = radius.sm }: GlassCardProps) {
  const isDark = useSettingsStore((s) => s.themeMode) === 'dark';
  const g = isDark ? glass.dark : glass.light;
  const blurInt = intensity ?? glass.blurIntensity.md;

  return (
    <View style={[styles.shadow, { borderRadius, shadowColor: g.shadow }]}>
      {/* clip: keeps blur + border inside rounded corners; receives all layout styles */}
      <View style={[styles.clip, { borderRadius }, style]}>
        <BlurView
          intensity={blurInt}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius, backgroundColor: g.overlay, borderWidth: 1, borderColor: g.border },
          ]}
        />
        {children}
      </View>
    </View>
  );
}

/**
 * GlassPanel — full-width bar for headers / status bars.
 * Accepts all ViewProps (including panHandlers) and forwards them to the layout View.
 * `style` carries all layout (flexDirection, padding, paddingTop, etc).
 * Blur and overlay are absolute so they don't break flex layout.
 */
export function GlassPanel({ children, style, intensity, ...rest }: GlassPanelProps) {
  const isDark = useSettingsStore((s) => s.themeMode) === 'dark';
  const g = isDark ? glass.dark : glass.light;
  const blurInt = intensity ?? glass.blurIntensity.lg;

  return (
    <View style={[styles.panel, style]} {...rest}>
      <BlurView
        intensity={blurInt}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: g.overlay }]} />
      <View style={[styles.panelBorder, { borderBottomColor: g.bottomBorder }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
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
