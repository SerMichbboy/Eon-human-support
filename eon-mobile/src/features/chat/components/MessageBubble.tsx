import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/shared/theme';
import { ChatMessage } from '../hooks/useChat';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={styles.text}>{message.content}</Text>
        <Text style={styles.time}>
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

export function TypingIndicator() {
  return (
    <View style={styles.row}>
      <View style={[styles.bubble, styles.bubbleAi, styles.typingBubble]}>
        <Text style={styles.typingDots}>• • •</Text>
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
  bubbleUser: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: colors.aiBubble,
    borderBottomLeftRadius: 4,
  },
  text: { ...typography.body },
  time: { ...typography.caption, alignSelf: 'flex-end' },
  typingBubble: { paddingVertical: spacing.sm },
  typingDots: { ...typography.body, color: colors.textMuted, letterSpacing: 4 },
});
