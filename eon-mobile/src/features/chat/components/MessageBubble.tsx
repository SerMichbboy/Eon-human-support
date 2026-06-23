import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { ChatMessage } from '../hooks/useChat';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const colors = useColors();
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: colors.userBubble }]
            : [styles.bubbleAi, { backgroundColor: colors.aiBubble }],
        ]}
      >
        <Text style={[styles.text, { color: colors.textPrimary }]}>{message.content}</Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

export function TypingIndicator() {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={[styles.bubble, styles.bubbleAi, { backgroundColor: colors.aiBubble }]}>
        <Text style={[styles.typingDots, { color: colors.textMuted }]}>• • •</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.md, marginVertical: 2 },
  rowUser: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  bubbleUser: { borderBottomRightRadius: 4 },
  bubbleAi: { borderBottomLeftRadius: 4 },
  text: { ...typography.body },
  time: { ...typography.caption, alignSelf: 'flex-end' },
  typingDots: { ...typography.body, letterSpacing: 4 },
});
