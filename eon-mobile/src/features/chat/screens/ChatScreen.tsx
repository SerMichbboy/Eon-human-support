import { useHeaderHeight } from '@react-navigation/elements';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useSettingsStore } from '@/shared/store/settings';
import { colors, spacing, typography } from '@/shared/theme';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble, TypingIndicator } from '../components/MessageBubble';
import { PatternOverlay } from '../components/PatternOverlay';
import { SettingsModal } from '../components/SettingsModal';
import { useChat } from '../hooks/useChat';

type Props = NativeStackScreenProps<AppStackParams, 'Chat'>;

export function ChatScreen({ navigation }: Props) {
  const { messages, isConnected, isTyping, hasMore, loadingMore, loadMore, send } = useChat();
  const listRef = useRef<FlatList>(null);
  const headerHeight = useHeaderHeight();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const { chatBg, pattern, patternColor, hydrate } = useSettingsStore();

  const { data: companion } = useQuery({
    queryKey: ['companion'],
    queryFn: () => companionApi.get().then((r) => r.data),
  });
  const companionName = companion?.name ?? 'Eon';

  useEffect(() => { hydrate(); }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setSettingsVisible(true)} hitSlop={12} style={{ marginRight: 4 }}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>⚙</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  // Inverted FlatList: data must be reversed (newest first → renders at bottom)
  const invertedData = [...messages].reverse();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: chatBg }]} edges={['bottom']}>
      <PatternOverlay pattern={pattern} color={patternColor} />
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
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
          data={invertedData}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          // Typing indicator shows at bottom (which is ListHeaderComponent in inverted)
          ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
          // "Load more" spinner at top (ListFooterComponent in inverted)
          ListFooterComponent={loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : null}
          inverted
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.list}
          style={{ backgroundColor: 'transparent' }}
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
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  statusDotOnline: { backgroundColor: colors.success },
  statusText: { ...typography.bodySmall, flex: 1 },
  profileLink: { ...typography.bodySmall, color: colors.accent },
  list: { paddingVertical: spacing.sm },
  loadingMore: { paddingVertical: spacing.md, alignItems: 'center' },
});
