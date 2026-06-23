import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useColors, radius, spacing, typography } from '@/shared/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrapper}>
      {label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.bgInput,
            borderColor: error ? colors.error : colors.border,
            color: colors.textPrimary,
          },
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        {...props}
      />
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
