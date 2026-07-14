import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { alpha, useColors, radius, spacing, typography } from '@/shared/theme';
import { GlassCard } from '@/shared/components/Glass';
import { EonLogo } from '@/shared/components/EonLogo';
import { ChatMessage } from '../hooks/useChat';

interface MessageBubbleProps {
  message: ChatMessage;
  /** Communication-style accent (see theme/styleAccent.ts) — tints a small
   * Eon mark on the AI's own bubble for which mode it's answering in. */
  accent?: string;
}

export function MessageBubble({ message, accent }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = message.role === 'user';
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.row, isUser && styles.rowUser]}>
      {isUser ? (
        <View style={[styles.bubble, styles.bubbleUser, { backgroundColor: colors.userBubble }]}>
          <Text style={[styles.text, { color: colors.userBubbleText }]}>{message.content}</Text>
          <Text style={[styles.time, { color: alpha(colors.userBubbleText, 0.6) }]}>
            {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      ) : (
        <GlassCard style={[styles.bubble, styles.bubbleAi]} borderRadius={radius.md} level="thin">
          {accent && (
            <View style={styles.logoRow}>
              <EonLogo size={14} color={accent} />
            </View>
          )}
          <Text style={[styles.text, { color: colors.textPrimary }]}>{message.content}</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>
            {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </GlassCard>
      )}
    </Animated.View>
  );
}

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-3, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return <Animated.View style={[styles.typingDot, { backgroundColor: color }, style]} />;
}

export function TypingIndicator({ accent }: { accent?: string }) {
  const colors = useColors();
  const dotColor = accent ?? colors.textMuted;
  return (
    <View style={styles.row}>
      <GlassCard style={[styles.bubble, styles.bubbleAi, styles.typingBubble]} borderRadius={radius.md} level="thin">
        <TypingDot delay={0} color={dotColor} />
        <TypingDot delay={130} color={dotColor} />
        <TypingDot delay={260} color={dotColor} />
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
  logoRow: { marginBottom: 2 },
  text: { ...typography.body },
  time: { ...typography.caption, alignSelf: 'flex-end' },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14 },
  typingDot: { width: 5, height: 5, borderRadius: 2.5 },
});
