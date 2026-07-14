import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { profileApi } from '@/features/profile/api';
import { BG_PRESETS, BgPreset, themeModeFromValue, useSettingsStore } from '@/shared/store/settings';
import { alpha, lightColors, useColors, Colors, fontFamily, radius, spacing, spring, typography, NAV_DELAY } from '@/shared/theme';
import { GlassPanel } from '@/shared/components/Glass';
import { IconButton } from '@/shared/components/IconButton';
import { TouchRipple, TouchRippleHandle } from '@/shared/components/TouchRipple';

type Props = NativeStackScreenProps<AppStackParams, 'Settings'>;

const STYLE_OPTIONS = [
  { id: 'listener', label: 'Слушатель',  desc: 'Просто рядом, без советов' },
  { id: 'friend',   label: 'Друг',       desc: 'Тепло, советует когда просят' },
  { id: 'mentor',   label: 'Наставник',  desc: 'Прямо и по существу' },
  { id: 'mirror',   label: 'Зеркало',    desc: 'Помогает думать вопросами' },
  { id: 'debater',  label: 'Полемик',    desc: 'Честная позиция, без уступок' },
];

const SWITCH_WIDTH = 52;
const SWITCH_HEIGHT = 31;
const SWITCH_THUMB = 27;
const SWITCH_INSET = 2;
const SWITCH_TRAVEL = SWITCH_WIDTH - SWITCH_THUMB - SWITCH_INSET * 2;

/** A plain iOS-style switch — tap only, no drag. Its own slide/color animation is
 * local (reanimated, UI thread only); it does not drive the app-wide theme
 * interpolation, so flipping it can't cause the re-render storm a draggable
 * continuous slider did. */
function ThemeToggle() {
  const themeValue = useSettingsStore((s) => s.themeValue);
  const toggleThemeExtreme = useSettingsStore((s) => s.toggleThemeExtreme);
  const isLight = themeValue >= 0.5;
  const progress = useSharedValue(isLight ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isLight ? 1 : 0, spring.snappy);
  }, [isLight]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(120,120,140,0.35)', lightColors.accent]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * SWITCH_TRAVEL }],
  }));

  return (
    <Pressable onPress={() => toggleThemeExtreme()} hitSlop={8}>
      <Animated.View style={[styles.switchTrack, trackStyle]}>
        <Animated.View style={[styles.switchThumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

// The layout box is the same fixed size for every swatch (never changes —
// that's what stopped the whole row from reflowing/"jumping" on selection).
// "25% bigger" is a `transform: scale` on the selected one instead of an
// actual width/height change, so the surrounding layout never has to reflow.
const UNSELECTED_SCALE = 1 / 1.25;

/** Chat background swatch — the selected one scales up 25% and shows a tiny
 * chat mockup (two bubble bars) so you can actually see how messages read on
 * it, not just the bare gradient. */
function PresetSwatch({
  preset,
  selected,
  boxSize,
  colors,
  onPress,
}: {
  preset: BgPreset;
  selected: boolean;
  boxSize: number;
  colors: Colors;
  onPress: () => void;
}) {
  const scale = useSharedValue(selected ? 1 : UNSELECTED_SCALE);

  useEffect(() => {
    scale.value = withSpring(selected ? 1 : UNSELECTED_SCALE, spring.snappy);
  }, [selected]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable style={[styles.presetWrap, { width: boxSize }]} onPress={onPress} hitSlop={4}>
      <Animated.View
        style={[
          styles.preview,
          { width: boxSize, height: boxSize, borderColor: selected ? colors.accent : 'transparent' },
          scaleStyle,
        ]}
      >
        <LinearGradient
          colors={preset.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {selected && (
          <View style={styles.miniChat}>
            <View style={[styles.miniBubbleAi, { backgroundColor: alpha('#FFFFFF', 0.4) }]} />
            <View style={[styles.miniBubbleUser, { backgroundColor: colors.userBubble }]} />
          </View>
        )}
        {selected && (
          <View style={[styles.checkCircle, { backgroundColor: colors.accent }]}>
            <Text style={[styles.checkmark, { color: colors.onAccent }]}>✓</Text>
          </View>
        )}
      </Animated.View>
      <Text
        style={[styles.presetLabel, { color: selected ? colors.accent : colors.textMuted }]}
        numberOfLines={1}
      >
        {preset.label}
      </Text>
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { presetId, setPreset } = useSettingsStore();
  const themeValue = useSettingsStore((s) => s.themeValue);
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const rippleRef = useRef<TouchRippleHandle>(null);

  // Settings slides in from the left (see AppNavigator) — swiping back right→left
  // mirrors that and returns to Chat. Whole screen, not just the header. Claimed
  // on the capture phase so the axis is decided once per gesture, not
  // re-litigated on every move (see ChatScreen's headerPan for the same pattern).
  const backPan = useMemo(() => {
    const isHorizontalDrag = (g: { dx: number; dy: number }) =>
      Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 12;
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
        if (g.dx < -50) setTimeout(() => navigation.goBack(), NAV_DELAY);
      },
      onPanResponderTerminate: () => {
        rippleRef.current?.release();
      },
    });
  }, [navigation]);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
  });

  const [currentStyle, setCurrentStyle] = useState(
    profile?.companion_preferences?.communication_style ?? 'friend'
  );

  useEffect(() => {
    if (profile?.companion_preferences?.communication_style) {
      setCurrentStyle(profile.companion_preferences.communication_style);
    }
  }, [profile]);

  const styleMutation = useMutation({
    mutationFn: (styleId: string) =>
      profileApi.update({
        step: 'companion_preferences',
        companion_preferences: { ...profile?.companion_preferences, communication_style: styleId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} {...backPan.panHandlers}>
      {/* Header */}
      <GlassPanel style={[styles.header, { paddingTop: insets.top }]}>
        <IconButton onPress={() => navigation.goBack()} pressDelay={NAV_DELAY} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </IconButton>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Настройки</Text>
        <View style={styles.backBtn} />
      </GlassPanel>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>

        {/* Theme */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Тема</Text>
          <View style={styles.themeRow}>
            <Text style={styles.themeRowIcon}>{themeValue >= 0.5 ? '☀️' : '🌙'}</Text>
            <Text style={[styles.themeRowLabel, { color: colors.textPrimary }]}>
              {themeValue >= 0.5 ? 'Светлая' : 'Тёмная'}
            </Text>
            <ThemeToggle />
          </View>
        </View>

        {/* Communication style */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Стиль общения</Text>
          <View style={styles.styleCol}>
            {STYLE_OPTIONS.map((opt) => {
              const selected = currentStyle === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.styleCard,
                    { borderColor: selected ? colors.accent : colors.border },
                    selected && { backgroundColor: alpha(colors.accentMuted, 0.13) },
                  ]}
                  onPress={() => { setCurrentStyle(opt.id); styleMutation.mutate(opt.id); }}
                >
                  <Text style={[styles.styleLabel, { color: selected ? colors.accent : colors.textPrimary }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.styleDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Chat background */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Фон чата</Text>
          {(() => {
            const visiblePresets = BG_PRESETS.filter((preset) => preset.mode === themeModeFromValue(themeValue));
            // Sized to always fit all of them in one row, no scroll — that scroll
            // used to fight the screen's own swipe-back gesture for the same
            // horizontal drag. Box size is the fixed layout footprint for every
            // swatch; "selected" only scales visually within that same footprint.
            const gap = spacing.sm;
            const available = screenWidth - spacing.xl * 2 - gap * (visiblePresets.length - 1);
            const boxSize = Math.floor(available / visiblePresets.length);
            return (
              <View style={styles.presetRow}>
                {visiblePresets.map((preset) => (
                  <PresetSwatch
                    key={preset.id}
                    preset={preset}
                    selected={presetId === preset.id}
                    boxSize={boxSize}
                    colors={colors}
                    onPress={() => setPreset(preset)}
                  />
                ))}
              </View>
            );
          })()}
        </View>

      </ScrollView>

      <TouchRipple ref={rippleRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h2 },
  scroll: { padding: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionLabel: {
    ...typography.bodySmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  themeRowIcon: { fontSize: 18 },
  themeRowLabel: { ...typography.body, flex: 1 },
  switchTrack: {
    width: SWITCH_WIDTH,
    height: SWITCH_HEIGHT,
    borderRadius: SWITCH_HEIGHT / 2,
    justifyContent: 'center',
  },
  switchThumb: {
    position: 'absolute',
    left: SWITCH_INSET,
    width: SWITCH_THUMB,
    height: SWITCH_THUMB,
    borderRadius: SWITCH_THUMB / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  styleCol: { gap: spacing.sm },
  styleCard: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 4,
  },
  styleLabel: { ...typography.bodySemibold },
  styleDesc: { ...typography.caption, lineHeight: 16 },
  presetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  presetWrap: { alignItems: 'center', gap: spacing.xs },
  preview: {
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniChat: {
    ...StyleSheet.absoluteFillObject,
    padding: 8,
    justifyContent: 'flex-end',
    gap: 4,
  },
  miniBubbleAi: {
    alignSelf: 'flex-start',
    width: '60%',
    height: 8,
    borderRadius: 4,
  },
  miniBubbleUser: {
    alignSelf: 'flex-end',
    width: '45%',
    height: 8,
    borderRadius: 4,
  },
  checkCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { fontSize: 10, fontFamily: fontFamily.bold },
  presetLabel: { ...typography.caption },
});
