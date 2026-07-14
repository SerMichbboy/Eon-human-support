import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { scrim, useColors, spacing, typography } from '@/shared/theme';

interface Props {
  visible: boolean;
  message?: string;
}

export function FullscreenLoader({ visible, message }: Props) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: scrim }]}>
        <Animated.View entering={FadeIn.duration(200)} style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <ActivityIndicator size="large" color={colors.accent} />
          {!!message && <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 20,
    paddingVertical: spacing.xl,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: spacing.md,
  },
  text: { ...typography.bodySmall, textAlign: 'center', maxWidth: 200 },
});
