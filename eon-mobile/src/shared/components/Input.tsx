import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useColors, radius, spacing, timing, typography } from '@/shared/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, onFocus, onBlur, ...props }: Props) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    shadowOpacity: focus.value * 0.35,
  }));

  return (
    <View style={styles.wrapper}>
      {label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
      <Animated.View
        style={[
          { borderRadius: radius.sm, shadowColor: colors.accent, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
          animatedBorderStyle,
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.bgInput,
              borderColor: error ? colors.error : focused ? colors.accent : colors.border,
              color: colors.textPrimary,
            },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          onFocus={(e) => { setFocused(true); focus.value = withTiming(1, timing.fast); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); focus.value = withTiming(0, timing.fast); onBlur?.(e); }}
          {...props}
        />
      </Animated.View>
      {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { ...typography.bodySmall },
  input: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    ...typography.body,
  },
  error: { ...typography.caption },
});
