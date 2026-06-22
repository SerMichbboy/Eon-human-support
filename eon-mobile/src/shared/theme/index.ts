export const colors = {
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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 9999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 22, fontWeight: '600' as const, color: colors.textPrimary },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.textPrimary },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 11, fontWeight: '400' as const, color: colors.textMuted },
} as const;
