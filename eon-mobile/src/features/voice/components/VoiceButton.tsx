import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useColors, radius, spring } from '@/shared/theme';
import { RecorderState } from '../hooks/useAudioRecorder';

interface Props {
  state: RecorderState;
  onPressIn: () => void;
  onPressOut: () => void;
  onLock: () => void;
}

const LOCK_THRESHOLD = -55;

/** A ring expanding outward from the button and fading as it grows — the
 * classic "listening/recording" pulse (Siri, Google Assistant, ...), reads
 * much more clearly as "capturing audio" than a plain breathing scale on the
 * button itself did. Two rings staggered half a cycle apart (`delay`) so a
 * new one is always mid-expansion, instead of one ring popping, fully
 * fading, then popping again with a visible gap. Remounts (and restarts
 * cleanly from 0) each time recording starts, since it's only rendered
 * while `isActive`. */
function Ring({ color, delay }: { color: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.45,
    transform: [{ scale: 1 + progress.value * 0.8 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

/** Slide-to-lock used the old RN `Animated` API + a raw `PanResponder`
 * calling `.setValue()` on every touch-move — each call is a JS↔native
 * bridge round-trip, and with `PanResponder`'s move events already running
 * on the JS thread, any JS-thread backpressure (even just other components
 * re-rendering) shows up as visibly janky, catch-up-style finger tracking
 * instead of smooth 1:1 following. Reanimated shared values live in memory
 * shared directly with the UI thread — assigning `.value` from this same JS
 * callback has no bridge serialization to wait on, which is why every other
 * drag-driven animation in this app (IconButton, style/preset growth, the
 * theme crossfade, ...) already uses this pattern instead of old `Animated`. */
export function VoiceButton({ state, onPressIn, onPressOut, onLock }: Props) {
  const colors = useColors();
  const slideY = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const lockedRef = useRef(false);

  const onPressInRef = useRef(onPressIn);
  const onPressOutRef = useRef(onPressOut);
  const onLockRef = useRef(onLock);
  useEffect(() => { onPressInRef.current = onPressIn; }, [onPressIn]);
  useEffect(() => { onPressOutRef.current = onPressOut; }, [onPressOut]);
  useEffect(() => { onLockRef.current = onLock; }, [onLock]);

  const isActive = state === 'recording' || state === 'locked';
  const isLocked = state === 'locked';

  // `recorder.start()` is async (permissions, then setting up the actual
  // audio session) — real device latency, not something we can hide
  // entirely. Without `pressScale`, nothing at all responded to the touch
  // until that resolved and `state` finally flipped to 'recording', at
  // which point the button's colors and icon used to just snap — a beat of
  // apparent unresponsiveness followed by an abrupt jump is what actually
  // read as "jerky." `pressScale` reacts to the touch itself, instantly,
  // independent of whichever async state `recorder` is still catching up to.
  const activeProgress = useSharedValue(0);
  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, { duration: 220 });
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      pressScale.value = withSpring(1, spring.gentle);
    }
    if (!isActive) {
      slideY.value = withSpring(0, spring.gentle);
    }
  }, [isActive]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        lockedRef.current = false;
        pressScale.value = withSpring(0.88, spring.snappy);
        onPressInRef.current();
      },
      onPanResponderMove: (_, gesture) => {
        if (!lockedRef.current) {
          // Direct assignment (not withSpring/withTiming) while actively
          // dragging — the finger itself is already the "animation," any
          // easing here would just add lag between touch and button.
          slideY.value = Math.min(0, gesture.dy);
          if (gesture.dy < LOCK_THRESHOLD) {
            lockedRef.current = true;
            slideY.value = withSpring(0, spring.gentle);
            onLockRef.current();
          }
        }
      },
      onPanResponderRelease: () => {
        if (!lockedRef.current) {
          slideY.value = withSpring(0, spring.gentle);
          pressScale.value = withSpring(1, spring.gentle);
          onPressOutRef.current();
        }
      },
      onPanResponderTerminate: () => {
        if (!lockedRef.current) {
          slideY.value = withSpring(0, spring.gentle);
          pressScale.value = withSpring(1, spring.gentle);
          onPressOutRef.current();
        }
      },
    })
  ).current;

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  // isLocked's own bg/border swap (accentMuted → accent) stays an instant
  // snap deliberately — that's a distinct user action (slide-to-lock), not
  // part of the idle→recording transition this is smoothing. `interpolateColor`
  // at activeProgress===1 just resolves to whichever end color is current, so
  // locking still reads as an immediate, deliberate state change.
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    backgroundColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      [colors.bgInput, isLocked ? colors.accent : colors.accentMuted],
    ),
    borderColor: interpolateColor(activeProgress.value, [0, 1], [colors.border, colors.accent]),
  }));

  return (
    <Animated.View style={wrapStyle}>
      {state === 'recording' && (
        <View style={[styles.lockHint, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="arrow-up-outline" size={13} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.btnWrap}>
        {isActive && (
          <>
            <Ring color={colors.accent} delay={0} />
            <Ring color={colors.accent} delay={700} />
          </>
        )}
        <Animated.View style={[styles.btn, btnStyle]} {...panResponder.panHandlers}>
          {isLocked ? (
            <Animated.View key="locked" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.onAccent} />
            </Animated.View>
          ) : isActive ? (
            <Animated.View key="dot" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
            </Animated.View>
          ) : (
            <Animated.View key="mic" entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
              <Ionicons name="mic-outline" size={22} color={colors.textSecondary} />
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btnWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  btn: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  activeDot: { width: 12, height: 12, borderRadius: 6 },
  lockHint: {
    position: 'absolute',
    top: -28,
    alignSelf: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
});
