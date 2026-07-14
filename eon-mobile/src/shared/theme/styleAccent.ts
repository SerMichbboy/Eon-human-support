import { darkColors, lightColors } from './colors';
import { useSettingsStore } from '../store/settings';
import { mixColor } from './utils';

/**
 * Chat-scoped accent that varies by the AI's communication style — dry/cool
 * (closer to the app's core violet `accent`) for direct styles, warmer
 * (toward `accentWarm`) for gentle ones. A single "warmth" dial (0 = driest,
 * 1 = warmest) mixed between those two existing tokens — so adding a new
 * style later is one more line here (a warmth number), never a hand-picked
 * new hue, and it always stays within the app's own two accent tones.
 * Unknown/future styles fall back to a neutral mid-warmth rather than
 * breaking.
 *
 * Deliberately scoped to chat elements only (message bubble accent, typing
 * indicator) — the app's primary `accent` token stays constant everywhere
 * else so Eon still reads as the same companion no matter which mode is on.
 */
const STYLE_WARMTH: Record<string, number> = {
  mentor: 0.1,
  debater: 0.3,
  mirror: 0.5,
  listener: 0.65,
  friend: 0.9,
};
const DEFAULT_WARMTH = 0.5;

export function getStyleAccent(style: string | undefined | null, themeValue: number): string {
  const warmth = (style ? STYLE_WARMTH[style] : undefined) ?? DEFAULT_WARMTH;
  const cool = mixColor(darkColors.accent, lightColors.accent, themeValue);
  const warm = mixColor(darkColors.accentWarm, lightColors.accentWarm, themeValue);
  return mixColor(cool, warm, warmth);
}

export function useStyleAccent(style: string | undefined | null): string {
  const themeValue = useSettingsStore((s) => s.themeValue);
  return getStyleAccent(style, themeValue);
}
