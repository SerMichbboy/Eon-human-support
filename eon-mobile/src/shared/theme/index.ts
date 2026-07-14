export { darkColors, lightColors, colors, useColors } from './colors';
export type { Colors } from './colors';
export { useMaterial, scrim, darkMaterial, lightMaterial } from './material';
export type { MaterialLevel, MaterialSpec } from './material';
export { ThemeAnimationProvider, useAnimatedThemeValue } from './ThemeAnimation';
export { spring, timing, durations, NAV_DELAY } from './motion';
export { typography, fontFamily } from './typography';
export { alpha, mixColor } from './utils';
export { getStyleAccent, useStyleAccent } from './styleAccent';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 28,
  full: 9999,
} as const;
