import { BlurView } from 'expo-blur';
import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSettingsStore } from '@/shared/store/settings';
import { glass, radius } from '@/shared/theme';

interface GlassProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  borderRadius?: number;
}

export function GlassCard({ children, style, intensity, borderRadius = radius.sm }: GlassProps) {
  const isDark = useSettingsStore((s) => s.themeMode) === 'dark';
  const g = isDark ? glass.dark : glass.light;
  const blurInt = intensity ?? glass.blurIntensity.md;

  return (
    <View style={[styles.shadow, { borderRadius, shadowColor: g.shadow }, style]}>
      <BlurView intensity={blurInt} tint={isDark ? 'dark' : 'light'} style={[styles.blurFill, { borderRadius }]}>
        <View style={[styles.cardOverlay, { borderRadius, backgroundColor: g.overlay, borderColor: g.border }]}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

export function GlassPanel({ children, style, intensity, borderRadius = 0 }: GlassProps) {
  const isDark = useSettingsStore((s) => s.themeMode) === 'dark';
  const g = isDark ? glass.dark : glass.light;
  const blurInt = intensity ?? glass.blurIntensity.lg;

  return (
    <BlurView intensity={blurInt} tint={isDark ? 'dark' : 'light'} style={[{ borderRadius }, style]}>
      <View style={[styles.panelOverlay, { borderRadius, backgroundColor: g.overlay, borderBottomColor: g.bottomBorder }]}>
        {children}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  blurFill: { overflow: 'hidden' },
  cardOverlay: { borderWidth: 1 },
  panelOverlay: { borderBottomWidth: StyleSheet.hairlineWidth },
});
