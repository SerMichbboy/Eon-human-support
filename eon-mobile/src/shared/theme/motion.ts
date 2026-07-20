import type { WithTimingConfig } from 'react-native-reanimated';

// Named "personalities", not per-screen tuning — every call site should pick one of these three.
// No `as WithSpringConfig` cast here deliberately — that interface marks every
// field optional, which widens these literals to `number | undefined` and
// breaks call sites like `.damping(spring.gentle.damping)` that need a plain
// `number`. The inferred literal type below is still structurally assignable
// wherever a `WithSpringConfig` is expected (e.g. `withSpring(value, spring.gentle)`).
export const spring = {
  gentle: { damping: 20, stiffness: 120, mass: 1 },
  snappy: { damping: 18, stiffness: 220, mass: 0.8 },
  bouncy: { damping: 12, stiffness: 180, mass: 1 },
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
