import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

/**
 * Web-only stand-in for `react-native-reanimated`.
 *
 * `useSharedValue` hangs at construction time on web with this project's
 * exact dependency versions (reanimated 4.1.7 / worklets 0.5.1 / Expo SDK 54
 * / RN 0.81.5 / React 19) — reproduced with a minimal isolated repro
 * (`useSharedValue(0)` alone, no `withTiming`, no provider tree), confirmed
 * it's not a `Platform.OS` misdetection (correctly reports `"web"`), not the
 * `react-native-worklets/plugin` babel transform (still hangs with it fully
 * removed), and not a version-pin mismatch (`expo install` reports the
 * pinned worklets version already matches Expo SDK 54's compatibility
 * table). Root cause not fully isolated beyond that; see
 * memory/project-web-target-blocked.md. Metro redirects every
 * `react-native-reanimated` import to this file for `platform === 'web'`
 * only (see `metro.config.js`) — native (iOS/Android) is untouched and
 * keeps using the real library.
 *
 * This trades animation fidelity for "renders at all": shared values are
 * plain React state (so every `.value` write re-renders, unlike real
 * Reanimated's UI-thread bypass), and `withTiming`/`withSpring` drive a
 * real rAF tween rather than snapping instantly, so things still look
 * reasonably smooth. `entering`/`exiting`/`layout` mount-animation props are
 * accepted (so the chainable `FadeIn.springify().damping(...)` call sites
 * don't throw) but not actually applied — a static appearance is an
 * acceptable trade for now given this app runs a reduced (no-voice)
 * feature set on web to begin with.
 */

type Cancel = () => void;
type AnimDescriptor = {
  __webAnim: true;
  run: (from: number, onUpdate: (v: number) => void, onDone: () => void) => Cancel;
};

function isDescriptor(v: unknown): v is AnimDescriptor {
  return !!v && typeof v === 'object' && (v as any).__webAnim === true;
}

function tween(toValue: number, duration: number, onUpdate: (v: number) => void, onDone: () => void, from: number): Cancel {
  const start = performance.now();
  const startValue = from;
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / Math.max(1, duration));
    const eased = 1 - (1 - t) ** 3; // ease-out cubic; config's real easing curve isn't replicated
    onUpdate(startValue + (toValue - startValue) * eased);
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      onDone();
    }
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function withTiming(toValue: number, config?: { duration?: number }, callback?: (finished?: boolean) => void): number {
  const duration = config?.duration ?? 300;
  return {
    __webAnim: true,
    run: (from, onUpdate, onDone) =>
      tween(toValue, duration, onUpdate, () => {
        onDone();
        callback?.(true);
      }, from),
  } as unknown as number;
}

export function withSpring(toValue: number, _config?: unknown, callback?: (finished?: boolean) => void): number {
  return withTiming(toValue, { duration: 350 }, callback);
}

export function withDelay(delayMs: number, animation: number): number {
  return {
    __webAnim: true,
    run: (from, onUpdate, onDone) => {
      const timer = setTimeout(() => {
        cancel = isDescriptor(animation) ? animation.run(from, onUpdate, onDone) : (onUpdate(animation), onDone(), () => {});
      }, delayMs);
      let cancel: Cancel = () => clearTimeout(timer);
      return () => cancel();
    },
  } as unknown as number;
}

export function withSequence(...animations: number[]): number {
  return {
    __webAnim: true,
    run: (from, onUpdate, onDone) => {
      let cancelled = false;
      let cancelCurrent: Cancel = () => {};
      let idx = 0;
      const runNext = (currentFrom: number) => {
        if (cancelled) return;
        if (idx >= animations.length) {
          onDone();
          return;
        }
        const anim = animations[idx++];
        if (isDescriptor(anim)) {
          cancelCurrent = anim.run(currentFrom, onUpdate, () => runNext((anim as any)._last ?? currentFrom));
        } else {
          onUpdate(anim);
          runNext(anim);
        }
      };
      runNext(from);
      return () => {
        cancelled = true;
        cancelCurrent();
      };
    },
  } as unknown as number;
}

export function withRepeat(animation: number, numberOfReps = 2, reverse = false): number {
  return {
    __webAnim: true,
    run: (from, onUpdate, onDone) => {
      let cancelled = false;
      let cancelCurrent: Cancel = () => {};
      let iteration = 0;
      const infinite = numberOfReps <= 0;
      const runIteration = (currentFrom: number, forward: boolean) => {
        if (cancelled) return;
        if (!infinite && iteration >= numberOfReps) {
          onDone();
          return;
        }
        iteration++;
        if (!isDescriptor(animation)) {
          onUpdate(animation);
          runIteration(animation, forward);
          return;
        }
        cancelCurrent = animation.run(currentFrom, onUpdate, () => {
          const next = reverse ? currentFrom : currentFrom;
          runIteration(next, !forward);
        });
      };
      runIteration(from, true);
      return () => {
        cancelled = true;
        cancelCurrent();
      };
    },
  } as unknown as number;
}

export function cancelAnimation(_sharedValue: unknown): void {
  // Cancellation is handled per-shared-value in useSharedValue's own cleanup.
}

export function useSharedValue<T>(initialValue: T): { value: T } {
  const [, forceRender] = useState(0);
  const ref = useRef(initialValue);
  const cancelRef = useRef<Cancel>(() => {});

  const mutable = useMemo(
    () => ({
      get value() {
        return ref.current;
      },
      set value(next: T) {
        cancelRef.current();
        if (isDescriptor(next)) {
          cancelRef.current = next.run(
            typeof ref.current === 'number' ? (ref.current as unknown as number) : 0,
            (v) => {
              ref.current = v as unknown as T;
              forceRender((n) => n + 1);
            },
            () => {},
          );
        } else {
          ref.current = next;
          forceRender((n) => n + 1);
        }
      },
    }),
    [],
  );

  useEffect(() => () => cancelRef.current(), []);
  return mutable;
}

export function useAnimatedStyle<T>(factory: () => T, _deps?: unknown[]): T {
  return factory();
}

export function interpolate(value: number, inputRange: number[], outputRange: number[]): number {
  if (value <= inputRange[0]) return outputRange[0];
  const last = inputRange.length - 1;
  if (value >= inputRange[last]) return outputRange[last];
  for (let i = 1; i < inputRange.length; i++) {
    if (value <= inputRange[i]) {
      const t = (value - inputRange[i - 1]) / (inputRange[i] - inputRange[i - 1]);
      return outputRange[i - 1] + t * (outputRange[i] - outputRange[i - 1]);
    }
  }
  return outputRange[last];
}

function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s.trim()));
    return [r, g, b, a ?? 1];
  }
  return [0, 0, 0, 1];
}

export function interpolateColor(value: number, inputRange: number[], outputColorRange: string[]): string {
  const last = inputRange.length - 1;
  let idx = last;
  for (let i = 1; i < inputRange.length; i++) {
    if (value <= inputRange[i]) {
      idx = i;
      break;
    }
  }
  const i0 = Math.max(0, idx - 1);
  const t = inputRange[idx] === inputRange[i0] ? 0 : (value - inputRange[i0]) / (inputRange[idx] - inputRange[i0]);
  const [r0, g0, b0, a0] = parseColor(outputColorRange[i0]);
  const [r1, g1, b1, a1] = parseColor(outputColorRange[idx]);
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  const a = a0 + (a1 - a0) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const identity = (t: number) => t;
export const Easing = {
  linear: identity,
  ease: identity,
  quad: identity,
  sin: identity,
  in: (_fn?: unknown) => identity,
  out: (_fn?: unknown) => identity,
  inOut: (_fn?: unknown) => identity,
  bezier: (..._args: number[]) => identity,
};

function makeAnimationBuilder() {
  const builder: any = {};
  ['duration', 'delay', 'springify', 'damping', 'stiffness', 'mass', 'easing', 'withInitialValues'].forEach((method) => {
    builder[method] = () => builder;
  });
  return builder;
}

export const FadeIn = makeAnimationBuilder();
export const FadeOut = makeAnimationBuilder();
export const FadeInUp = makeAnimationBuilder();
export const FadeOutDown = makeAnimationBuilder();

export type SharedValue<T> = { value: T };

function stripAnimationProps<P extends Record<string, any>>(props: P) {
  const { entering, exiting, layout, ...rest } = props as any;
  return rest;
}

const AnimatedView = forwardRef<View, any>((props, ref) => <View ref={ref} {...stripAnimationProps(props)} />);
const AnimatedText = forwardRef<Text, any>((props, ref) => <Text ref={ref} {...stripAnimationProps(props)} />);
const AnimatedImage = forwardRef<Image, any>((props, ref) => <Image ref={ref} {...stripAnimationProps(props)} />);
const AnimatedScrollView = forwardRef<ScrollView, any>((props, ref) => <ScrollView ref={ref} {...stripAnimationProps(props)} />);

function createAnimatedComponent<P extends object>(Component: React.ComponentType<P>) {
  return forwardRef<unknown, P>((props, ref) => <Component ref={ref as any} {...stripAnimationProps(props)} />);
}

const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  createAnimatedComponent,
};

export default Animated;
