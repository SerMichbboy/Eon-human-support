export const fontFamily = {
  light: 'Onest_300Light',
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
} as const;

export const typography = {
  h1: { fontSize: 28, fontFamily: fontFamily.bold },
  h2: { fontSize: 22, fontFamily: fontFamily.semibold },
  h3: { fontSize: 18, fontFamily: fontFamily.semibold },
  body: { fontSize: 15, fontFamily: fontFamily.regular },
  bodyMedium: { fontSize: 15, fontFamily: fontFamily.medium },
  bodySemibold: { fontSize: 15, fontFamily: fontFamily.semibold },
  bodySmall: { fontSize: 13, fontFamily: fontFamily.regular },
  caption: { fontSize: 11, fontFamily: fontFamily.regular },
} as const;
