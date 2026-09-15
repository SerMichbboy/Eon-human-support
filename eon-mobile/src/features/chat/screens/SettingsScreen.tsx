import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { profileApi } from '@/features/profile/api';
import { BG_PRESETS, BgPreset, themeModeFromValue, useSettingsStore } from '@/shared/store/settings';
import { alpha, useColors, useStyleAccent, Colors, radius, spacing, spring, typography, NAV_DELAY } from '@/shared/theme';
import { EonLogo } from '@/shared/components/EonLogo';
import { GlassPanel } from '@/shared/components/Glass';
import { IconButton } from '@/shared/components/IconButton';
import { TouchRipple, TouchRippleHandle } from '@/shared/components/TouchRipple';

type Props = NativeStackScreenProps<AppStackParams, 'Settings'>;

const STYLE_OPTIONS = [
  {
    id: 'listener',
    label: 'Слушатель',
    points: [
      'Не перебивает и не спешит с советами',
      'Даёт просто выговориться',
      'Задаёт вопросы, чтобы ты сам разобрался',
      'Рядом, когда нужно, чтобы услышали',
    ],
  },
  {
    id: 'friend',
    label: 'Друг',
    points: [
      'Тёплый и неформальный тон',
      'Поддерживает и подбадривает',
      'Советует, только если попросишь',
      'Радуется победам вместе с тобой',
    ],
  },
  {
    id: 'mentor',
    label: 'Наставник',
    points: [
      'Говорит прямо, не смягчая',
      'Фокус на решении, а не на утешении',
      'Может покритиковать по делу',
      'Даёт конкретные шаги, а не общие фразы',
    ],
  },
  {
    id: 'mirror',
    label: 'Зеркало',
    points: [
      'Отвечает вопросом на вопрос',
      'Помогает увидеть мысль со стороны',
      'Не даёт готовых ответов',
      'Подталкивает к своим выводам',
    ],
  },
  {
    id: 'debater',
    label: 'Полемик',
    points: [
      'Отстаивает свою точку зрения',
      'Может не согласиться и поспорить',
      'Не подстраивается, чтобы понравиться',
      'Проверяет твои аргументы на прочность',
    ],
  },
];

const SEGMENT_SIZE = 34;
const SEGMENT_GAP = 3;

/**
 * Moon/sun segmented picker — replaces a generic iOS-style switch, which
 * read as an off-the-shelf system control rather than something that
 * belongs to this app. Reuses the same selection language as everything
 * else here (an accent-filled capsule marking the active choice, like the
 * style cards below and the preset swatches) instead of introducing a new,
 * unrelated visual idiom just for this one control.
 *
 * Tap only, no drag. The slide animation is local (reanimated, UI thread
 * only) and doesn't drive the app-wide theme interpolation itself, so
 * flipping it can't cause the re-render storm a draggable continuous
 * slider did (see settings store notes).
 */
function ThemeToggle() {
  const themeValue = useSettingsStore((s) => s.themeValue);
  const toggleThemeExtreme = useSettingsStore((s) => s.toggleThemeExtreme);
  const colors = useColors();
  const isLight = themeValue >= 0.5;
  const progress = useSharedValue(isLight ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isLight ? 1 : 0, spring.snappy);
  }, [isLight]);

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, SEGMENT_SIZE]) }],
  }));

  return (
    <Pressable onPress={() => toggleThemeExtreme()} hitSlop={6}>
      <View style={[styles.segmentTrack, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
        <Animated.View style={[styles.segmentHighlight, { backgroundColor: colors.accent }, highlightStyle]} />
        <View style={styles.segmentIcon}>
          <Ionicons name="moon-outline" size={16} color={isLight ? colors.textMuted : colors.onAccent} />
        </View>
        <View style={styles.segmentIcon}>
          <Ionicons name="sunny-outline" size={16} color={isLight ? colors.onAccent : colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

const SELECTED_GROWTH = 1.5;

/** Chat background swatch — the selected one is genuinely 50% bigger (real
 * width/height, not a scale trick) and shows a tiny chat mockup (two bubble
 * bars) so you can actually see how messages read on it, not just the bare
 * gradient.
 *
 * Size is driven by a shared value + `withSpring`, not `layout={LinearTransition}`.
 * Reanimated's layout-transition props animate by scaling a snapshot via
 * transform, not a true per-frame relayout — with a border + border-radius
 * and percentage-sized children (miniChat bubbles) that reads as a visibly
 * "crooked" squish/stretch mid-animation. Animating width/height directly
 * triggers a real Yoga relayout every frame, so the border stays uniform and
 * children stay correctly proportioned throughout. */
function PresetSwatch({
  preset,
  selected,
  baseSize,
  colors,
  onPress,
}: {
  preset: BgPreset;
  selected: boolean;
  baseSize: number;
  colors: Colors;
  onPress: () => void;
}) {
  const targetSize = selected ? baseSize * SELECTED_GROWTH : baseSize;
  const size = useSharedValue(targetSize);

  useEffect(() => {
    size.value = withSpring(targetSize, spring.gentle);
  }, [targetSize]);

  const sizeStyle = useAnimatedStyle(() => ({ width: size.value, height: size.value }));

  return (
    <Pressable style={styles.presetWrap} onPress={onPress} hitSlop={4}>
      <Animated.View
        style={[
          styles.preview,
          sizeStyle,
          { borderColor: selected ? colors.accent : 'transparent' },
        ]}
      >
        <LinearGradient
          colors={preset.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {selected && (
          <View style={styles.miniChat}>
            <View style={[styles.miniBubbleAi, { backgroundColor: alpha('#FFFFFF', 0.4) }]} />
            <View style={[styles.miniBubbleUser, { backgroundColor: colors.userBubble }]} />
          </View>
        )}
        {selected && (
          <View style={[styles.checkCircle, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={12} color={colors.onAccent} />
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

const STYLE_GROWTH = 1.15;

/** Communication-style card — collapsed to just its label; the selected
 * one visibly grows (15%, `STYLE_GROWTH` — same "selected item grows"
 * language as `PresetSwatch`, but via padding since these are full-width
 * rows with no spare width to expand into) and smoothly reveals its bullet
 * points. No absolutely-positioned children here, so this never needed the
 * "crooked" workaround the preset swatch did — still animated as direct
 * style values rather than `layout={LinearTransition}` for consistency.
 *
 * The bullets panel measures its own natural height once via `onLayout`
 * (content is always mounted, just clipped by the wrapper's `overflow:
 * hidden`), then animates the wrapper's height between 0 and that measured
 * value — the standard reliable "auto-height" collapse/reveal pattern,
 * since a fixed height would either clip wrapped text or leave dead space
 * depending on device width.
 *
 * The reveal also leads with a small `EonLogo` tinted via `useStyleAccent`
 * (the same per-communication-style hue used on the AI's message bubble in
 * chat, see `theme/styleAccent.ts`) plus a one-line caption — the point is
 * to teach the connection ("this color on Eon in chat = this style") right
 * where the user is choosing the style, not leave them to notice the tint
 * shift in chat on their own. Bullet dots reuse the same color for the same
 * reason; the card's own selected-state border/background stay the app's
 * plain `colors.accent` — that's "you picked this," a different signal from
 * "this is this style's chat color." */
function StyleCard({
  id,
  label,
  points,
  selected,
  colors,
  onPress,
}: {
  id: string;
  label: string;
  points: string[];
  selected: boolean;
  colors: Colors;
  onPress: () => void;
}) {
  const styleAccentColor = useStyleAccent(id);
  const [contentHeight, setContentHeight] = useState(0);
  const targetPadding = spacing.md * (selected ? STYLE_GROWTH : 1);
  const padding = useSharedValue(targetPadding);
  const revealProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    padding.value = withSpring(targetPadding, spring.gentle);
  }, [targetPadding]);

  useEffect(() => {
    revealProgress.value = withTiming(selected ? 1 : 0, { duration: 260 });
  }, [selected]);

  const paddingStyle = useAnimatedStyle(() => ({ padding: padding.value }));
  const revealStyle = useAnimatedStyle(() => ({
    height: revealProgress.value * contentHeight,
    opacity: revealProgress.value,
    marginTop: revealProgress.value * spacing.xs,
  }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          styles.styleCard,
          paddingStyle,
          { borderColor: selected ? colors.accent : colors.border },
          selected && { borderWidth: 2 },
        ]}
      >
        <Text style={[styles.styleLabel, { color: selected ? colors.accent : colors.textPrimary }]}>
          {label}
        </Text>
        <Animated.View style={[styles.styleRevealWrap, revealStyle]}>
          <View onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)} style={styles.stylePoints}>
            <View style={styles.styleAccentRow}>
              <EonLogo size={16} color={styleAccentColor} />
              <Text style={[styles.styleAccentLabel, { color: colors.textMuted }]}>Цвет Eon в чате</Text>
            </View>
            {points.map((point) => (
              <View key={point} style={styles.styleBulletRow}>
                <View style={[styles.styleBulletDot, { backgroundColor: styleAccentColor }]} />
                <Text style={[styles.styleBulletText, { color: colors.textSecondary }]}>{point}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
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
        companion_preferences: {
          tone: '',
          directiveness: '',
          forbidden_topics: [] as string[],
          ...profile?.companion_preferences,
          communication_style: styleId,
        },
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

        {/* Appearance — theme toggle + chat background live under one
            heading now: both are "how the app looks," and having "Фон
            чата" as its own separate section next to "Оформление" was a
            distinction without a difference. */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Оформление</Text>
          <View style={styles.themeRow}>
            <Animated.Text
              key={themeValue >= 0.5 ? 'light' : 'dark'}
              entering={FadeIn.duration(200)}
              style={[styles.themeRowLabel, { color: colors.textSecondary }]}
            >
              {themeValue >= 0.5 ? 'Светлая' : 'Тёмная'}
            </Animated.Text>
            <ThemeToggle />
          </View>
          {(() => {
            const visiblePresets = BG_PRESETS.filter((preset) => preset.mode === themeModeFromValue(themeValue));
            // Sized to always fit all of them in one row, no scroll — that scroll
            // used to fight the screen's own swipe-back gesture for the same
            // horizontal drag. `baseSize` is the unselected size; exactly one
            // item (whichever is selected) renders at baseSize * SELECTED_GROWTH,
            // so the fit math reserves room for that up front — count - 1 normal
            // items plus one SELECTED_GROWTH-sized item, not `count` equal boxes.
            const gap = spacing.sm;
            const available = screenWidth - spacing.xl * 2 - gap * (visiblePresets.length - 1);
            const baseSize = Math.floor(available / (visiblePresets.length - 1 + SELECTED_GROWTH));
            return (
              <View style={styles.presetRow}>
                {visiblePresets.map((preset) => (
                  <PresetSwatch
                    key={preset.id}
                    preset={preset}
                    selected={presetId === preset.id}
                    baseSize={baseSize}
                    colors={colors}
                    onPress={() => setPreset(preset)}
                  />
                ))}
              </View>
            );
          })()}
        </View>

        {/* Communication style — a thin top divider between sections, same
            hairline treatment as ProfileScreen's `aboutCard`/`profileRow`,
            instead of relying on bare whitespace to separate them. */}
        <View style={[styles.section, styles.sectionDivider, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Стиль общения</Text>
          <View style={styles.styleCol}>
            {STYLE_OPTIONS.map((opt) => (
              <StyleCard
                key={opt.id}
                id={opt.id}
                label={opt.label}
                points={opt.points}
                selected={currentStyle === opt.id}
                colors={colors}
                onPress={() => { setCurrentStyle(opt.id); styleMutation.mutate(opt.id); }}
              />
            ))}
          </View>
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
  sectionDivider: { marginTop: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1 },
  sectionLabel: {
    ...typography.bodySmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeRowLabel: { ...typography.body },
  segmentTrack: {
    flexDirection: 'row',
    width: SEGMENT_SIZE * 2 + SEGMENT_GAP * 2,
    height: SEGMENT_SIZE + SEGMENT_GAP * 2,
    borderRadius: (SEGMENT_SIZE + SEGMENT_GAP * 2) / 2,
    borderWidth: 1,
    padding: SEGMENT_GAP,
  },
  segmentHighlight: {
    position: 'absolute',
    top: SEGMENT_GAP,
    left: SEGMENT_GAP,
    width: SEGMENT_SIZE,
    height: SEGMENT_SIZE,
    borderRadius: SEGMENT_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentIcon: {
    width: SEGMENT_SIZE,
    height: SEGMENT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleCol: { gap: spacing.sm },
  styleCard: {
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  styleLabel: { ...typography.bodySemibold },
  styleRevealWrap: { overflow: 'hidden' },
  stylePoints: { gap: 6, paddingTop: 2 },
  styleAccentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  styleAccentLabel: { ...typography.caption },
  styleBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  styleBulletDot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  styleBulletText: { ...typography.caption, lineHeight: 16, flex: 1 },
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
    ...StyleSheet.absoluteFill,
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
  presetLabel: { ...typography.caption },
});
