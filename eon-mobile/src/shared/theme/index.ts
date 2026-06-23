import { useSettingsStore } from '../store/settings';

export const darkColors = {
  bg: '#0F0F14',
  bgCard: '#1A1A24',
  bgInput: '#22222E',
  border: '#2A2A3A',
  accent: '#7B6EF6',
  accentMuted: '#3D3666',
  textPrimary: '#F0EFF8',
  textSecondary: '#8A8AA0',
  textMuted: '#55556A',
  userBubble: '#2E2B50',
  aiBubble: '#1E1E2C',
  error: '#E05C7A',
  success: '#4CC9A0',
} as const;

export const lightColors = {
  bg: '#F2F1FA',
  bgCard: '#FFFFFF',
  bgInput: '#ECEAF8',
  border: '#D8D5F0',
  accent: '#7B6EF6',
  accentMuted: '#EAE8FF',
  textPrimary: '#1A1828',
  textSecondary: '#5C5A78',
  textMuted: '#9896B0',
  userBubble: '#7B6EF6',
  aiBubble: '#FFFFFF',
  error: '#E05C7A',
  success: '#4CC9A0',
} as const;

export type Colors = typeof darkColors;

// Static fallback (dark) — used outside components
export const colors: Colors = darkColors;

export function useColors(): Colors {
  const themeMode = useSettingsStore((s) => s.themeMode);
  return themeMode === 'light' ? lightColors : darkColors;
}

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

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '600' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodySmall: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '400' as const },
} as const;
