import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSettingsStore } from '@/shared/store/settings';
import { darkColors, lightColors, mixColor } from '@/shared/theme';

/**
 * Masks the instant theme swap (the switch/icon toggle is a single jump, no
 * in-between) with a cross-dissolve: covers the screen with the outgoing
 * value's bg color, then fades it away to reveal the new theme underneath.
 */
export function ThemeTransitionOverlay() {
  const themeValue = useSettingsStore((s) => s.themeValue);
  const prevValueRef = useRef(themeValue);
  const opacity = useSharedValue(0);
  const [overlayColor, setOverlayColor] = useState<string>(darkColors.bg);

  useEffect(() => {
    const prev = prevValueRef.current;
    if (prev !== themeValue) {
      setOverlayColor(mixColor(darkColors.bg, lightColors.bg, prev));
      opacity.value = 1;
      opacity.value = withTiming(0, { duration: 420 });
    }
    prevValueRef.current = themeValue;
  }, [themeValue]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, animatedStyle, { backgroundColor: overlayColor, zIndex: 999 }]}
    />
  );
}
