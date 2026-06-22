import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { colors, radius, typography } from '@/shared/theme';

interface Props {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

export function Button({ title, loading, disabled, variant = 'primary', onPress }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        pressed && styles.pressed,
      ]}
      disabled={loading || disabled}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : colors.accent} />
      ) : (
        <Text style={[styles.label, !isPrimary && styles.ghostLabel]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primary: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.75 },
  label: { ...typography.body, fontWeight: '600', color: '#fff' },
  ghostLabel: { color: colors.accent },
});
