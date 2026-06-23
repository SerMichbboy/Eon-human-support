import React from 'react';
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native';
import { useColors, radius, typography } from '@/shared/theme';

interface Props {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

export function Button({ title, loading, disabled, variant = 'primary', onPress }: Props) {
  const colors = useColors();
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        { borderRadius: radius.md },
        isPrimary
          ? { backgroundColor: colors.accent }
          : { borderWidth: 1, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      disabled={loading || disabled}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : colors.accent} />
      ) : (
        <Text style={[styles.label, !isPrimary && { color: colors.accent }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pressed: { opacity: 0.75 },
  label: { ...typography.body, fontWeight: '600', color: '#fff' },
});
