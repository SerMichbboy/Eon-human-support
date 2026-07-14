import React, { createContext, ReactNode, useContext, useEffect } from 'react';
import { Easing, SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSettingsStore } from '@/shared/store/settings';

/**
 * A UI-thread copy of `themeValue`, kept in sync via `withTiming` whenever
 * the store's (now-instant) value changes.
 *
 * The store value itself just flips 0/1 in one `set()` call — cheap, single
 * re-render. Smoothing that jump into a crossfade by *also* stepping the
 * store value through a JS-driven ramp was the previous approach, and it
 * stuttered: every step was a Zustand `set()`, which re-renders every
 * `useColors()`/`useMaterial()` consumer on screen — including every
 * `BlurView`-wrapped Glass panel — on the JS thread, repeatedly, in a tight
 * window. This context instead exposes the animation as a Reanimated shared
 * value, so consumers that read colors via `useAnimatedStyle`/
 * `interpolateColor` (see `Glass.tsx`) animate entirely on the UI thread —
 * no JS re-render, no bridge traffic, per frame.
 */
const ThemeAnimationContext = createContext<SharedValue<number> | null>(null);

export function ThemeAnimationProvider({ children }: { children: ReactNode }) {
  const themeValue = useSettingsStore((s) => s.themeValue);
  const animatedValue = useSharedValue(themeValue);

  useEffect(() => {
    animatedValue.value = withTiming(themeValue, { duration: 550, easing: Easing.inOut(Easing.quad) });
  }, [themeValue]);

  return <ThemeAnimationContext.Provider value={animatedValue}>{children}</ThemeAnimationContext.Provider>;
}

export function useAnimatedThemeValue(): SharedValue<number> {
  const ctx = useContext(ThemeAnimationContext);
  if (!ctx) throw new Error('useAnimatedThemeValue must be used within ThemeAnimationProvider');
  return ctx;
}
