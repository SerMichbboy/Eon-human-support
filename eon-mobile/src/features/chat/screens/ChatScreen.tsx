import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { companionApi } from '@/features/companion/api';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { useSettingsStore } from '@/shared/store/settings';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { GlassPanel } from '@/shared/components/Glass';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble, TypingIndicator } from '../components/MessageBubble';
import { PatternOverlay } from '../components/PatternOverlay';

import { useChat } from '../hooks/useChat';

type Props = NativeStackScreenProps<AppStackParams, 'Chat'>;

const SCROLL_THRESHOLD = 120;

export function ChatScreen({ navigation }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, isConnected, isTyping, loadingMore, loadMore, send } = useChat();
  const listRef = useRef<FlatList>(null);

  const [scrolledUp, setScrolledUp] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { chatBg, pattern, patternColor, hydrate } = useSettingsStore();

  const { data: companion } = useQuery({
    queryKey: ['companion'],
    queryFn: () => companionApi.get().then((r) => r.data),
  });
  const companionName = companion?.name ?? 'Eon';

  // Hide the native header — we render our own
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: scrolledUp ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [scrolledUp]);

  // left→right = settings, right→left = profile
  const headerPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 12,
    onPanResponderRelease: (_, g) => {
      if (g.dx > 50) navigation.navigate('Settings');
      else if (g.dx < -50) navigation.navigate('Profile');
    },
  }), [navigation]);

  const handleScroll = useCallback((e: any) => {
    setScrolledUp(e.nativeEvent.contentOffset.y > SCROLL_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const invertedData = [...messages].reverse();

  return (
    <View style={[styles.root, { backgroundColor: chatBg }]}>
      <PatternOverlay pattern={pattern} color={patternColor} />

      {/* Custom header — full JS, PanResponder works everywhere */}
      <GlassPanel
        style={[styles.navHeader, { paddingTop: insets.top }]}
        {...headerPan.panHandlers}
      >
        <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={12} style={styles.navBtn}>
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>⚙</Text>
        </Pressable>

        <Text style={[styles.headerName, { color: colors.textPrimary }]} pointerEvents="none">
          {companionName.toUpperCase()}
        </Text>

        <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </GlassPanel>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Status bar */}
        <GlassPanel style={styles.statusBar} {...headerPan.panHandlers}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? colors.success : colors.textMuted }]} />
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            {isConnected ? `${companionName} онлайн` : 'Подключение...'}
          </Text>
        </GlassPanel>

        <View style={styles.listWrapper}>
          <FlatList
            ref={listRef}
            data={invertedData}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
            ListFooterComponent={loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.textMuted} />
              </View>
            ) : null}
            inverted
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            contentContainerStyle={styles.list}
            style={{ backgroundColor: 'transparent' }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />

          <Animated.View
            style={[styles.scrollBtn, { opacity: fadeAnim, transform: [{ scale: fadeAnim }] }]}
            pointerEvents={scrolledUp ? 'auto' : 'none'}
          >
            <Pressable
              style={[styles.scrollBtnInner, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
              onPress={scrollToBottom}
            >
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </Pressable>
          </Animated.View>
        </View>

        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput onSend={send} disabled={!isConnected} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 15,
    fontWeight: '300',
    letterSpacing: 5,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { ...typography.bodySmall, flex: 1 },
  listWrapper: { flex: 1 },
  list: { paddingVertical: spacing.sm },
  loadingMore: { paddingVertical: spacing.md, alignItems: 'center' },
  scrollBtn: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scrollBtnInner: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});
