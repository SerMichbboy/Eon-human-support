import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

// Named "personalities", not per-screen tuning — every call site should pick one of these three.
export const spring = {
  gentle: { damping: 20, stiffness: 120, mass: 1 } as WithSpringConfig,
  snappy: { damping: 18, stiffness: 220, mass: 0.8 } as WithSpringConfig,
  bouncy: { damping: 12, stiffness: 180, mass: 1 } as WithSpringConfig,
} as const;

export const timing = {
  fast: { duration: 150 } as WithTimingConfig,
  base: { duration: 250 } as WithTimingConfig,
  slow: { duration: 400 } as WithTimingConfig,
} as const;

// Plain millisecond values for call sites still on the legacy Animated API.
export const durations = { fast: 150, base: 250, slow: 400 } as const;

// Delay before firing a navigation call from a tap/swipe — lets the gesture's
// own feedback (icon bounce, swipe release) become visible before the screen
// transition cuts it away. Shared so every nav trigger feels the same beat.
export const NAV_DELAY = 110;
