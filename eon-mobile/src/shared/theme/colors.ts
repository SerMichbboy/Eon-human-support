import { useMemo } from 'react';
import { useSettingsStore } from '../store/settings';
import { mixColor } from './utils';

export const darkColors = {
  bg: '#10121A',
  bgCard: '#1B1E2A',
  bgInput: '#232735',
  border: '#2E3244',
  accent: '#8A7CFA',
  accentMuted: '#352F52',
  accentWarm: '#D9A066',
  onAccent: '#FFFFFF',
  textPrimary: '#EEEDF6',
  textSecondary: '#9393AC',
  textMuted: '#5C5C74',
  userBubble: '#34305A',
  userBubbleText: '#EEEDF6',
  aiBubble: '#1F2230',
  error: '#E2708A',
  success: '#52C9A6',
} as const;

export const lightColors = {
  bg: '#F5F3FA',
  bgCard: '#FFFFFF',
  bgInput: '#EDEBF6',
  border: '#DEDCF2',
  accent: '#7A6DF0',
  accentMuted: '#EDEBFF',
  accentWarm: '#C98A4B',
  onAccent: '#FFFFFF',
  textPrimary: '#1C1A2B',
  textSecondary: '#605E7C',
  textMuted: '#9C9AB3',
  userBubble: '#E4E0FB',
  userBubbleText: '#2A2452',
  aiBubble: '#FFFFFF',
  error: '#D9647E',
  success: '#46B896',
} as const;

export type Colors = { -readonly [K in keyof typeof darkColors]: string };

// Static fallback (dark) — used outside components
export const colors: Colors = darkColors;

const colorKeys = Object.keys(darkColors) as (keyof Colors)[];

export function useColors(): Colors {
  const themeValue = useSettingsStore((s) => s.themeValue);
  return useMemo(() => {
    const mixed = {} as Colors;
    for (const key of colorKeys) {
      mixed[key] = mixColor(darkColors[key], lightColors[key], themeValue);
    }
    return mixed;
  }, [themeValue]);
}
