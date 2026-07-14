import React from 'react';
import { View } from 'react-native';
import { alpha, useColors } from '@/shared/theme';

interface Props {
  size?: number;
  /** Overrides the theme accent — used e.g. for the per-communication-style tint in chat. */
  color?: string;
}

export function EonLogo({ size = 40, color }: Props) {
  const colors = useColors();
  const tint = color ?? colors.accent;
  const accentDim = alpha(tint, 0.28);
  const r = size / 72;
  const ring = Math.round(64 * r);
  const dot = Math.round(12 * r);
  const arc = Math.round(24 * r);
  const arcTop = Math.round(24 * r);
  const arcLeftOff = Math.round(2 * r);
  const arcRightOff = Math.round(2 * r);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: ring, height: ring, borderRadius: ring / 2,
        borderWidth: Math.max(1, Math.round(2 * r)),
        borderColor: tint,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <View style={{
          width: dot, height: dot, borderRadius: dot / 2,
          backgroundColor: tint,
          shadowColor: tint, shadowOpacity: 0.9, shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 }, elevation: 6,
        }} />
      </View>
      <View style={{
        position: 'absolute', width: arc, height: arc, borderRadius: arc / 2,
        borderWidth: Math.max(1, Math.round(2 * r)), borderColor: accentDim,
        left: arcLeftOff, top: arcTop,
      }} />
      <View style={{
        position: 'absolute', width: arc, height: arc, borderRadius: arc / 2,
        borderWidth: Math.max(1, Math.round(2 * r)), borderColor: accentDim,
        right: arcRightOff, top: arcTop,
      }} />
    </View>
  );
}
