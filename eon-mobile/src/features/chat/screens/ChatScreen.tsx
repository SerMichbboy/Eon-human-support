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
import ReanimatedView, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { companionApi } from '@/features/companion/api';
import { profileApi } from '@/features/profile/api';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { useSettingsStore } from '@/shared/store/settings';
import { useColors, useStyleAccent, fontFamily, radius, spacing, typography, NAV_DELAY } from '@/shared/theme';
import { GlassPanel } from '@/shared/components/Glass';
import { IconButton } from '@/shared/components/IconButton';
import { TouchRipple, TouchRippleHandle } from '@/shared/components/TouchRipple';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble, TypingIndicator } from '../components/MessageBubble';

import { ConnectionStatus, useChat } from '../hooks/useChat';

type Props = NativeStackScreenProps<AppStackParams, 'Chat'>;

const SCROLL_THRESHOLD = 120;

const STATUS_LABEL: Record<ConnectionStatus, (name: string) => string> = {
  connected: (name) => `${name} онлайн`,
  connecting: () => 'Подключение...',
  disconnected: () => 'Недоступен',
};
const STATUS_COLOR: Record<ConnectionStatus, (colors: ReturnType<typeof useColors>) => string> = {
  connected: (colors) => colors.success,
  connecting: (colors) => colors.textMuted,
  disconnected: (colors) => colors.error,
};

export function ChatScreen({ navigation }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, connectionStatus, isConnected, isTyping, loadingMore, loadMore, send } = useChat();
  const listRef = useRef<FlatList>(null);

  const [scrolledUp, setScrolledUp] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const rippleRef = useRef<TouchRippleHandle>(null);
  const { chatBgColors, hydrate } = useSettingsStore();

  // Recorder state lives inside ChatInput — mirrored up here so the header
  // swipe gesture and its nav buttons can be locked out while a recording is
  // in flight. Without this, swiping (or tapping settings/profile) navigated
  // away mid-recording with no way back to it — the recording kept running
  // unattended (or was silently lost, depending on the screen), which read
  // as the app "eating" the recording.
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const isRecordingActiveRef = useRef(isRecordingActive);
  useEffect(() => { isRecordingActiveRef.current = isRecordingActive; }, [isRecordingActive]);

  const { data: companion } = useQuery({
    queryKey: ['companion'],
    queryFn: () => companionApi.get().then((r) => r.data),
  });
  const companionName = companion?.name ?? 'Eon';

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
  });
  const styleAccent = useStyleAccent(profile?.companion_preferences?.communication_style);

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

  // left→right = settings, right→left = profile. Attached to the whole screen
  // (not just the header) so the swipe works no matter where you drag from.
  // Claimed on the *capture* phase (evaluated before the FlatList's own scroll
  // responder gets a look) so a clearly-horizontal drag locks out vertical
  // scroll for the whole gesture, and a clearly-vertical one never gets
  // reconsidered as a swipe mid-scroll — the axis is decided once, not
  // re-litigated on every move event.
  const headerPan = useMemo(() => {
    const isHorizontalDrag = (g: { dx: number; dy: number }) =>
      !isRecordingActiveRef.current && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 12;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => isHorizontalDrag(g),
      onMoveShouldSetPanResponder: (_, g) => isHorizontalDrag(g),
      onPanResponderGrant: (evt) => {
        rippleRef.current?.triggerAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderMove: (evt) => {
        rippleRef.current?.moveTo(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderRelease: (_, g) => {
        rippleRef.current?.release();
        if (g.dx > 50) setTimeout(() => navigation.navigate('Settings'), NAV_DELAY);
        else if (g.dx < -50) setTimeout(() => navigation.navigate('Profile'), NAV_DELAY);
      },
      onPanResponderTerminate: () => {
        rippleRef.current?.release();
      },
    });
  }, [navigation]);

  const handleScroll = useCallback((e: any) => {
    setScrolledUp(e.nativeEvent.contentOffset.y > SCROLL_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const invertedData = [...messages].reverse();

  return (
    <View style={styles.root} {...headerPan.panHandlers}>
      <LinearGradient
        colors={chatBgColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Custom header — full JS. Swipe-to-navigate is on the whole screen (see
          `headerPan` above), not just this bar. */}
      <GlassPanel style={[styles.navHeader, { paddingTop: insets.top }]}>
        <IconButton
          onPress={() => { if (!isRecordingActive) navigation.navigate('Settings'); }}
          pressDelay={NAV_DELAY}
          hitSlop={12}
          style={styles.navBtn}
        >
          <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
        </IconButton>

        <Text style={[styles.headerName, { color: colors.textPrimary }]} pointerEvents="none">
          {companionName.toUpperCase()}
        </Text>

        <IconButton
          onPress={() => { if (!isRecordingActive) navigation.navigate('Profile'); }}
          pressDelay={NAV_DELAY}
          hitSlop={12}
          style={styles.navBtn}
        >
          <Ionicons name="person-outline" size={22} color={colors.textSecondary} />
        </IconButton>
      </GlassPanel>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Status — no card/border, just a quiet dot + label */}
        <ReanimatedView.View key={connectionStatus} entering={FadeIn.duration(200)} style={styles.statusBar}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[connectionStatus](colors) }]} />
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            {STATUS_LABEL[connectionStatus](companionName)}
          </Text>
        </ReanimatedView.View>

        <View style={styles.listWrapper}>
          <FlatList
            ref={listRef}
            data={invertedData}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} accent={item.role === 'assistant' ? styleAccent : undefined} />}
            ListHeaderComponent={isTyping ? <TypingIndicator accent={styleAccent} /> : null}
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
            <IconButton
              style={[styles.scrollBtnInner, { backgroundColor: colors.bgCard, borderColor: colors.border, shadowColor: colors.accent }]}
              onPress={scrollToBottom}
            >
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </IconButton>
          </Animated.View>
        </View>

        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput onSend={send} disabled={!isConnected} onRecordingActiveChange={setIsRecordingActive} />
        </View>
      </KeyboardAvoidingView>

      <TouchRipple ref={rippleRef} />
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
    fontFamily: fontFamily.light,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});
