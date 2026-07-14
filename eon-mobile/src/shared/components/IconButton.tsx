import React, { ReactNode } from 'react';
import { GestureResponderEvent, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { spring } from '@/shared/theme';

interface Props {
  children: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  /** Delay (ms) before firing onPress after the tap completes — gives the
   * bounce a moment to become visible before a navigation transition cuts
   * the screen away underneath it. 0 (default) fires immediately. */
  pressDelay?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Icon-only button with a springy press animation — same "personality" as
 * Button.tsx, just for bare icons (nav/header actions) instead of labeled
 * buttons. The press-in/out squeeze alone is too quick to register on a fast
 * tap (finger down-and-up happens in ~100ms, faster than the eye catches a
 * subtle scale change) — so the noticeable part is a bigger overshoot "pop"
 * played *after* release, independent of how quickly the tap happened.
 */
export function IconButton({ children, onPress, hitSlop, style, pressDelay = 0 }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      hitSlop={hitSlop}
      onPressIn={() => { scale.value = withSpring(0.78, spring.snappy); }}
      onPress={(e) => {
        scale.value = withSequence(
          withSpring(1.35, spring.bouncy),
          withSpring(1, spring.gentle),
        );
        if (pressDelay > 0) {
          setTimeout(() => onPress?.(e), pressDelay);
        } else {
          onPress?.(e);
        }
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
