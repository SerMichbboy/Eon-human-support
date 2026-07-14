import React from 'react';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useColors, radius, spring, typography } from '@/shared/theme';

interface Props {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({ title, loading, disabled, variant = 'primary', onPress }: Props) {
  const colors = useColors();
  const isPrimary = variant === 'primary';
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={[
        styles.base,
        { borderRadius: radius.md },
        isPrimary
          ? { backgroundColor: colors.accent }
          : { borderWidth: 1, borderColor: colors.border },
        animatedStyle,
      ]}
      disabled={loading || disabled}
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.96, spring.snappy); }}
      onPressOut={() => { scale.value = withSpring(1, spring.snappy); }}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.label, { color: isPrimary ? colors.onAccent : colors.accent }]}>{title}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: { ...typography.bodySemibold },
});
