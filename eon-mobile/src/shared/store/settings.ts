import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

// Discrete label kept only for platform APIs that don't support a continuum
// (BlurView's `tint` prop, sun/moon iconography) — derive it, never store it.
export type ThemeMode = 'dark' | 'light';
export function themeModeFromValue(v: number): ThemeMode {
  return v < 0.5 ? 'dark' : 'light';
}

export interface BgPreset {
  id: string;
  label: string;
  mode: ThemeMode;
  colors: readonly [string, string, ...string[]];
}

export const BG_PRESETS: BgPreset[] = [
  { id: 'night',    label: 'Ночь',     mode: 'dark',  colors: ['#0D0E13', '#1D1B32'] },
  { id: 'depth',    label: 'Глубина',  mode: 'dark',  colors: ['#050B14', '#0C2E49'] },
  { id: 'forest',   label: 'Лес',      mode: 'dark',  colors: ['#070F0B', '#153420'] },
  { id: 'dusk',     label: 'Сумерки',  mode: 'dark',  colors: ['#150D20', '#2E1D49'] },
  { id: 'fog',      label: 'Туман',    mode: 'dark',  colors: ['#0A1416', '#1E3235'] },
  { id: 'ember',    label: 'Янтарь',   mode: 'dark',  colors: ['#160F07', '#37230E'] },
  { id: 'lavender', label: 'Лаванда',  mode: 'light', colors: ['#EDEAF8', '#DED8F5'] },
  { id: 'dew',      label: 'Роса',     mode: 'light', colors: ['#E7F1F5', '#D8ECEF'] },
  { id: 'cloud',    label: 'Облако',   mode: 'light', colors: ['#F7F4EF', '#EDE7DD'] },
  { id: 'mint',     label: 'Мята',     mode: 'light', colors: ['#EAF5EC', '#D7ECDC'] },
  { id: 'peach',    label: 'Персик',   mode: 'light', colors: ['#FBEEE3', '#F5DBC4'] },
  { id: 'blush',    label: 'Пудра',    mode: 'light', colors: ['#FBEAEE', '#F3D7DE'] },
];

function firstPresetFor(mode: ThemeMode): BgPreset {
  return BG_PRESETS.find((p) => p.mode === mode) ?? BG_PRESETS[0];
}

interface SettingsState {
  presetId: string;
  chatBgColors: readonly [string, string, ...string[]];
  /** 0 = full dark, 1 = full light. Anything in between is a real, valid theme. */
  themeValue: number;
  setPreset: (preset: BgPreset) => Promise<void>;
  /**
   * Jumps to the opposite full extreme — used by the theme switch and the
   * auth screens' icon. The store value itself flips instantly (one cheap
   * re-render); the visible crossfade lives entirely on the UI thread, see
   * `ThemeAnimation.tsx`'s `ThemeAnimationProvider` — animating this store
   * value itself through a JS-driven ramp was tried and reverted: every step
   * was a Zustand `set()`, which re-renders every `useColors()`/
   * `useMaterial()` consumer (including every `BlurView`-wrapped Glass panel)
   * on the JS thread, and stacking enough of those in under half a second is
   * what actually caused the stutter.
   */
  toggleThemeExtreme: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const useSettingsStore = create<SettingsState>((set, get) => ({
  presetId: 'night',
  chatBgColors: BG_PRESETS[0].colors,
  themeValue: 0,

  setPreset: async (preset) => {
    await SecureStore.setItemAsync('chat_preset', preset.id);
    set({ presetId: preset.id, chatBgColors: preset.colors });
  },

  toggleThemeExtreme: async () => {
    const next = get().themeValue < 0.5 ? 1 : 0;
    set({ themeValue: next });
    await SecureStore.setItemAsync('theme_value', String(next));

    // Chat backgrounds are theme-specific (dark presets for dark theme, light
    // for light) — if the current pick no longer matches, snap to the first
    // preset of the new mode instead of leaving a mismatched background.
    const nextMode = themeModeFromValue(next);
    const current = BG_PRESETS.find((p) => p.id === get().presetId);
    if (!current || current.mode !== nextMode) {
      const fallback = firstPresetFor(nextMode);
      set({ presetId: fallback.id, chatBgColors: fallback.colors });
      await SecureStore.setItemAsync('chat_preset', fallback.id);
    }
  },

  hydrate: async () => {
    const [id, storedValue, legacyMode] = await Promise.all([
      SecureStore.getItemAsync('chat_preset'),
      SecureStore.getItemAsync('theme_value'),
      SecureStore.getItemAsync('theme_mode'),
    ]);

    let themeValue = 0;
    if (storedValue !== null) {
      const parsed = parseFloat(storedValue);
      if (!Number.isNaN(parsed)) themeValue = clamp01(parsed);
    } else if (legacyMode === 'light' || legacyMode === 'dark') {
      // Migrate a pre-slider install: it only ever knew full dark or full light.
      themeValue = legacyMode === 'light' ? 1 : 0;
    }

    const mode = themeModeFromValue(themeValue);
    const stored = BG_PRESETS.find((p) => p.id === id);
    // Same guard as toggleThemeExtreme — an older install (or the migration
    // above) could otherwise restore a preset that doesn't match its theme.
    const preset = stored && stored.mode === mode ? stored : firstPresetFor(mode);

    set({ themeValue, presetId: preset.id, chatBgColors: preset.colors });
  },
}));
