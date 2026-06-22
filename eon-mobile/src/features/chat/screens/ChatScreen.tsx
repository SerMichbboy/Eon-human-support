import { useHeaderHeight } from '@react-navigation/elements';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { companionApi } from '@/features/companion/api';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { colors, spacing, typography } from '@/shared/theme';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble, TypingIndicator } from '../components/MessageBubble';
import { useChat } from '../hooks/useChat';

type Props = NativeStackScreenProps<AppStackParams, 'Chat'>;

export function ChatScreen({ navigation }: Props) {
  const { messages, isConnected, isTyping, send } = useChat();
  const listRef = useRef<FlatList>(null);
  const headerHeight = useHeaderHeight();
  const { data: companion } = useQuery({
    queryKey: ['companion'],
    queryFn: () => companionApi.get().then((r) => r.data),
  });
  const companionName = companion?.name ?? 'Eon';

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, isTyping]);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <View style={styles.header}>
          <View style={[styles.statusDot, isConnected && styles.statusDotOnline]} />
          <Text style={styles.statusText}>{isConnected ? `${companionName} онлайн` : 'Подключение...'}</Text>
          <Pressable onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.profileLink}>Профиль</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        <ChatInput onSend={send} disabled={!isConnected} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  statusDotOnline: { backgroundColor: colors.success },
  statusText: { ...typography.bodySmall, flex: 1 },
  profileLink: { ...typography.bodySmall, color: colors.accent },
  list: { paddingVertical: spacing.sm },
});
