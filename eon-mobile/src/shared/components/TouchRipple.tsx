import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useColors } from '@/shared/theme';

export interface TouchRippleHandle {
  /** Call on gesture start. Screen-absolute coordinates
   * (`evt.nativeEvent.pageX/pageY`) — converted internally to this
   * component's own local frame via a live measurement, since `locationX/Y`
   * is relative to whatever nested view actually caught the touch (a button,
   * a message bubble...), not the screen. */
  triggerAt: (pageX: number, pageY: number) => void;
  /** Call on every gesture move — makes the mark follow the finger and
   * stretch toward the direction of travel, so a swipe reads as a swipe
   * rather than a tap that happens to have started a drag. */
  moveTo: (pageX: number, pageY: number) => void;
  /** Call on release/terminate — fades the mark out. */
  release: () => void;
}

const SIZE = 90;

/**
 * A barely-visible "wave" that follows the finger during a swipe — confirms
 * the gesture is being tracked before there's any other feedback for it.
 * Purely decorative: `pointerEvents="none"`, so it never competes with the
 * gesture it's illustrating.
 */
export const TouchRipple = forwardRef<TouchRippleHandle>((_, ref) => {
  const colors = useColors();
  const containerRef = useRef<View>(null);
  const containerOffset = useRef({ x: 0, y: 0 });
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const stretchX = useSharedValue(1);

  useImperativeHandle(ref, () => ({
    triggerAt: (pageX: number, pageY: number) => {
      containerRef.current?.measure((_fx, _fy, _w, _h, containerPageX, containerPageY) => {
        containerOffset.current = { x: containerPageX, y: containerPageY };
        x.value = pageX - containerPageX;
        y.value = pageY - containerPageY;
        scale.value = 0.4;
        opacity.value = 0.18;
        scale.value = withTiming(1, { duration: 220 });
      });
    },
    moveTo: (pageX: number, pageY: number) => {
      const lx = pageX - containerOffset.current.x;
      const ly = pageY - containerOffset.current.y;
      const dx = lx - x.value;
      x.value = withTiming(lx, { duration: 90 });
      y.value = withTiming(ly, { duration: 90 });
      stretchX.value = withTiming(Math.max(0.85, Math.min(1.7, 1 + Math.abs(dx) / 30)), { duration: 90 });
    },
    release: () => {
      opacity.value = withTiming(0, { duration: 280 });
      stretchX.value = withTiming(1, { duration: 280 });
    },
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    left: x.value - SIZE / 2,
    top: y.value - SIZE / 2,
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { scaleX: stretchX.value }],
  }));

  return (
    <View ref={containerRef} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.ripple, { backgroundColor: colors.textPrimary }, animatedStyle]} />
    </View>
  );
});

const styles = StyleSheet.create({
  ripple: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
});
