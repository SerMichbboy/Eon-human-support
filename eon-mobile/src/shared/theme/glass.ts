export const glass = {
  blurIntensity: { sm: 20, md: 40, lg: 60 },
  dark: {
    overlay: 'rgba(12, 12, 20, 0.44)',
    border: 'rgba(255, 255, 255, 0.09)',
    bottomBorder: 'rgba(255, 255, 255, 0.06)',
    shadow: '#000000',
  },
  light: {
    overlay: 'rgba(255, 255, 255, 0.54)',
    border: 'rgba(0, 0, 0, 0.07)',
    bottomBorder: 'rgba(0, 0, 0, 0.05)',
    shadow: '#000000',
  },
} as const;
