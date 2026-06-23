import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type PatternType = 'none' | 'dots' | 'lines' | 'cross';
export type ThemeMode = 'dark' | 'light';

export interface BgPreset {
  id: string;
  label: string;
  color: string;
  pattern: PatternType;
  patternColor: string;
}

export const BG_PRESETS: BgPreset[] = [
  { id: 'night',    label: 'Ночь',     color: '#0F0F14', pattern: 'none',  patternColor: '#ffffff' },
  { id: 'depth',    label: 'Глубина',  color: '#09131F', pattern: 'dots',  patternColor: '#ffffff' },
  { id: 'forest',   label: 'Лес',      color: '#0B1510', pattern: 'dots',  patternColor: '#ffffff' },
  { id: 'dusk',     label: 'Сумерки',  color: '#13101D', pattern: 'cross', patternColor: '#ffffff' },
  { id: 'fog',      label: 'Туман',    color: '#0E1618', pattern: 'lines', patternColor: '#ffffff' },
  { id: 'ember',    label: 'Янтарь',   color: '#191108', pattern: 'dots',  patternColor: '#ffffff' },
  { id: 'lavender', label: 'Лаванда',  color: '#ECE8F5', pattern: 'dots',  patternColor: '#6B5FA0' },
  { id: 'dew',      label: 'Роса',     color: '#E6EFF6', pattern: 'dots',  patternColor: '#4A7A9B' },
];

interface SettingsState {
  presetId: string;
  chatBg: string;
  pattern: PatternType;
  patternColor: string;
  themeMode: ThemeMode;
  setPreset: (preset: BgPreset) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  presetId: 'night',
  chatBg: '#0F0F14',
  pattern: 'none',
  patternColor: '#ffffff',
  themeMode: 'dark',

  setPreset: async (preset) => {
    await SecureStore.setItemAsync('chat_preset', preset.id);
    set({ presetId: preset.id, chatBg: preset.color, pattern: preset.pattern, patternColor: preset.patternColor });
  },

  setThemeMode: async (mode) => {
    await SecureStore.setItemAsync('theme_mode', mode);
    set({ themeMode: mode });
  },

  hydrate: async () => {
    const [id, mode] = await Promise.all([
      SecureStore.getItemAsync('chat_preset'),
      SecureStore.getItemAsync('theme_mode'),
    ]);
    const preset = BG_PRESETS.find((p) => p.id === id);
    if (preset) set({ presetId: preset.id, chatBg: preset.color, pattern: preset.pattern, patternColor: preset.patternColor });
    if (mode === 'light' || mode === 'dark') set({ themeMode: mode });
  },
}));
