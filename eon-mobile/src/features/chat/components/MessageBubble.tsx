import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { GlassCard } from '@/shared/components/Glass';
import { ChatMessage } from '../hooks/useChat';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const colors = useColors();
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {isUser ? (
        <View style={[styles.bubble, styles.bubbleUser, { backgroundColor: colors.userBubble }]}>
          <Text style={[styles.text, { color: colors.textPrimary }]}>{message.content}</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      ) : (
        <GlassCard style={[styles.bubble, styles.bubbleAi]} borderRadius={radius.md} intensity={35}>
          <Text style={[styles.text, { color: colors.textPrimary }]}>{message.content}</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </GlassCard>
      )}
    </View>
  );
}

export function TypingIndicator() {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <GlassCard style={[styles.bubble, styles.bubbleAi]} borderRadius={radius.md} intensity={35}>
        <Text style={[styles.typingDots, { color: colors.textMuted }]}>• • •</Text>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, marginVertical: 2 },
  rowUser: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  bubbleUser: {
    borderRadius: radius.md,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {},
  text: { ...typography.body },
  time: { ...typography.caption, alignSelf: 'flex-end' },
  typingDots: { ...typography.body, letterSpacing: 4 },
});
