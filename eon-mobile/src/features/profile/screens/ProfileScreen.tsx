import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { companionApi } from '@/features/companion/api';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/shared/store/auth';
import { useColors, radius, spacing, typography, NAV_DELAY } from '@/shared/theme';
import { GlassCard, GlassPanel } from '@/shared/components/Glass';
import { IconButton } from '@/shared/components/IconButton';
import { TouchRipple, TouchRippleHandle } from '@/shared/components/TouchRipple';
import { profileApi } from '../api';

type Props = NativeStackScreenProps<AppStackParams, 'Profile'>;
type ColorsType = ReturnType<typeof useColors>;

type FeatureIcon = React.ComponentProps<typeof Ionicons>['name'];

const APP_FEATURES: { icon: FeatureIcon; title: string; desc: string }[] = [
  {
    icon: 'lock-closed-outline',
    title: 'Шифрование',
    desc: 'Данные зашифрованы твоим ключом — мы не можем их прочитать.',
  },
  {
    icon: 'time-outline',
    title: 'Память',
    desc: 'Помнит историю разговора между сессиями.',
  },
  {
    icon: 'color-palette-outline',
    title: 'Стиль',
    desc: '5 режимов общения на выбор.',
  },
  {
    icon: 'heart-outline',
    title: 'Без осуждений',
    desc: 'Говори о чём угодно.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Приватность',
    desc: 'Данные не продаём и не обучаем на них модели.',
  },
];

function AboutSection({ colors }: { colors: ColorsType }) {
  const carouselRef = useRef<FlatList>(null);

  // One-time "peek" nudge shortly after the screen settles — scrolls a little
  // right and back, hinting there's more to the side without an explicit label.
  useEffect(() => {
    const nudgeOut = setTimeout(() => {
      carouselRef.current?.scrollToOffset({ offset: 40, animated: true });
    }, 700);
    const nudgeBack = setTimeout(() => {
      carouselRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 1150);
    return () => { clearTimeout(nudgeOut); clearTimeout(nudgeBack); };
  }, []);

  return (
    <View style={[styles.section, styles.sectionDivider, { borderTopColor: colors.border }]}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Что такое Eon?</Text>
      <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
        Персональный AI-компаньон для разговора. Помнит историю, подстраивается под твой стиль общения.
      </Text>

      <FlatList
        ref={carouselRef}
        data={APP_FEATURES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.title}
        contentContainerStyle={styles.featuresScroll}
        renderItem={({ item }) => (
          <GlassCard style={styles.featureCard} borderRadius={radius.md} level="thin">
            <Ionicons name={item.icon} size={26} color={colors.accent} />
            <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>{item.title}</Text>
            <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
          </GlassCard>
        )}
      />

      <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Eon · v0.1</Text>
    </View>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const credential = useAuthStore((s) => s.credential);
  const credentialType = useAuthStore((s) => s.credentialType);
  const queryClient = useQueryClient();
  const [botName, setBotName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const savePendingRef = useRef(false);

  // Same custom "Liquid Glass" header as Chat/Settings, replacing the plain
  // native-stack header this screen used to rely on — it was the one screen
  // still using an off-the-shelf header instead of the app's own GlassPanel.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
  });

  const { data: companion } = useQuery({
    queryKey: ['companion'],
    queryFn: () => companionApi.get().then((r) => r.data),
  });

  useFocusEffect(useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  }, [queryClient]));

  // Profile slides in from the right (Chat's swipe right→left opens it) — swiping
  // back left→right mirrors that and returns to Chat. Whole screen, EXCEPT
  // over the horizontal feature carousel further down — that one wants the
  // same horizontal drag for its own scrolling.
  //
  // Three earlier approaches all tried to *guess* whether the touch was on
  // the carousel from scroll position alone (a flat scrollY cutoff, exact
  // cross-component `.measure()`, a height-based band) — all fragile, and
  // none actually asked "is this touch physically on the carousel."
  //
  // The real fix: only Chat/Settings use the capture phase
  // (`onMoveShouldSetPanResponderCapture`), which intercepts a drag *before*
  // any child gets a look at it — fine there, since nothing nested wants
  // horizontal drags. Profile has the carousel, which does. Using only the
  // bubble phase (`onMoveShouldSetPanResponder`) here lets the carousel's own
  // native horizontal ScrollView claim a drag that starts on it first, the
  // same way any nested scrollable/gesture-owner normally would in RN's
  // responder negotiation; our handler only gets it when nothing more
  // specific already claimed it. No position math, no measuring, no guessing.
  const rippleRef = useRef<TouchRippleHandle>(null);
  const backPan = useMemo(() => {
    const isHorizontalDrag = (g: { dx: number; dy: number }) =>
      Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 12;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => isHorizontalDrag(g),
      onPanResponderGrant: (evt) => {
        rippleRef.current?.triggerAt(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderMove: (evt) => {
        rippleRef.current?.moveTo(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      onPanResponderRelease: (_, g) => {
        rippleRef.current?.release();
        if (g.dx > 50) setTimeout(() => navigation.goBack(), NAV_DELAY);
      },
      onPanResponderTerminate: () => {
        rippleRef.current?.release();
      },
    });
  }, [navigation]);

  const renameMutation = useMutation({
    mutationFn: (name: string) => companionApi.rename(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companion'] });
      setEditingName(false);
    },
    onError: () => {
      Alert.alert('Не получилось сохранить', 'Попробуй ещё раз');
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const hasProfile = !!data?.basic_info?.preferred_name;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]} {...backPan.panHandlers}>
      <GlassPanel style={[styles.header, { paddingTop: insets.top }]}>
        <IconButton onPress={() => navigation.goBack()} pressDelay={NAV_DELAY} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </IconButton>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Мой профиль</Text>
        <View style={styles.backBtn} />
      </GlassPanel>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Ассистент</Text>
          <GlassCard style={styles.companionCard}>
            {editingName ? (
              // Own column, not squeezed into the same row as the name+link
              // display — the TextInput had no flex/width of its own there,
              // so it collapsed to near-nothing next to the Save button
              // crammed onto the same line.
              <View style={styles.renameEditCol}>
                <TextInput
                  style={[styles.renameInput, { backgroundColor: colors.bgInput, borderColor: colors.accent, color: colors.textPrimary }]}
                  value={botName}
                  onChangeText={setBotName}
                  placeholder="Введи имя..."
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  selectionColor={colors.accent}
                  autoFocus
                  // No explicit Cancel — tapping anywhere else blurs this
                  // field natively (a plain focus event, not a gesture — an
                  // earlier attempt wrapped the whole ScrollView in a
                  // Pressable to catch "outside" taps instead, and that
                  // broke scrolling: RN's touch responder system can let an
                  // ancestor Touchable/Pressable claim the gesture before a
                  // nested ScrollView recognizes it as a scroll). The
                  // `savePendingRef` guard exists because tapping the Save
                  // button *also* blurs this field (it's "elsewhere" too) —
                  // without it, the blur-triggered cancel would tear down
                  // the edit UI before Save's own onPress got a chance to run.
                  onBlur={() => {
                    setTimeout(() => {
                      if (!savePendingRef.current) setEditingName(false);
                    }, 150);
                  }}
                />
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.accent }]}
                  onPressIn={() => { savePendingRef.current = true; }}
                  onPress={() => {
                    if (botName.trim()) renameMutation.mutate(botName.trim());
                    savePendingRef.current = false;
                  }}
                >
                  <Text style={[styles.saveBtnText, { color: colors.onAccent }]}>
                    {renameMutation.isPending ? '...' : 'Сохранить'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.renameRow}>
                <Text style={[styles.companionName, { color: colors.textPrimary }]}>{companion?.name ?? 'Eon'}</Text>
                <Pressable onPress={() => { setBotName(companion?.name ?? 'Eon'); setEditingName(true); }}>
                  <Text style={[styles.editLink, { color: colors.accent }]}>Изменить</Text>
                </Pressable>
              </View>
            )}
          </GlassCard>
        </View>

        {/* Account credential sits above the profile-data card, not inside
            it — it's a login detail, not one of the "facts about you" that
            table holds, so it gets its own quiet line instead of being one
            more row in the same box. */}
        <View style={[styles.section, styles.sectionDivider, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Профиль</Text>

          {!!credential && (
            <View style={styles.accountRow}>
              <Ionicons
                name={credentialType === 'phone' ? 'phone-portrait-outline' : 'mail-outline'}
                size={15}
                color={colors.textMuted}
              />
              <Text style={[styles.accountLabel, { color: colors.textMuted }]}>
                {credentialType === 'phone' ? 'Телефон' : 'Email'}
              </Text>
              <Text style={[styles.accountValue, { color: colors.textSecondary }]} numberOfLines={1}>
                {credential}
              </Text>
            </View>
          )}

          {!hasProfile ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: colors.textPrimary }]}>Профиль не заполнен</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Расскажи о себе, чтобы Eon мог лучше тебя понять
              </Text>
              <Pressable
                style={[styles.fillBtn, { backgroundColor: colors.accent }]}
                onPress={() => navigation.navigate('Onboarding')}
              >
                <Text style={[styles.fillBtnText, { color: colors.onAccent }]}>Заполнить профиль</Text>
              </Pressable>
            </GlassCard>
          ) : (
            <>
              <GlassCard style={styles.profileCard}>
                {data.basic_info.preferred_name && (
                  <ProfileRow icon="person-outline" label="Имя" value={data.basic_info.preferred_name} first colors={colors} />
                )}
                {data.basic_info.age && (
                  <ProfileRow icon="calendar-outline" label="Возраст" value={`${data.basic_info.age} лет`} colors={colors} />
                )}
                {data.basic_info.location && (
                  <ProfileRow icon="location-outline" label="Город" value={data.basic_info.location} colors={colors} />
                )}
                {data.life_context.occupation && (
                  <ProfileRow icon="briefcase-outline" label="О себе" value={data.life_context.occupation} multiline colors={colors} />
                )}
                {data.life_context.family_status && (
                  <ProfileRow icon="people-outline" label="Семья" value={data.life_context.family_status} multiline colors={colors} />
                )}
                {!!data.life_context.close_people?.length && (
                  <ProfileRow icon="heart-outline" label="Близкие" value={data.life_context.close_people.join(', ')} multiline colors={colors} />
                )}
                {!!data.life_context.values?.length && (
                  <ProfileRow icon="star-outline" label="Ценности" value={data.life_context.values.join(', ')} multiline colors={colors} />
                )}
                {!!data.positive_moments.sources_of_energy?.length && (
                  <ProfileRow icon="sunny-outline" label="Что радует" value={data.positive_moments.sources_of_energy.join('\n')} multiline colors={colors} />
                )}
                {!!data.positive_moments.dreams?.length && (
                  <ProfileRow icon="sparkles-outline" label="Мечты" value={data.positive_moments.dreams.join(', ')} multiline colors={colors} />
                )}
                {!!data.struggles.coping_mechanisms?.length && (
                  <ProfileRow icon="leaf-outline" label="В трудные моменты" value={data.struggles.coping_mechanisms.join('\n')} multiline colors={colors} />
                )}
                {!!data.struggles.anxiety_topics?.length && (
                  <ProfileRow icon="alert-circle-outline" label="Что беспокоит" value={data.struggles.anxiety_topics.join(', ')} multiline colors={colors} />
                )}
              </GlassCard>
              <Pressable onPress={() => navigation.navigate('Onboarding')}>
                <Text style={[styles.editLink, { color: colors.accent }]}>Редактировать профиль</Text>
              </Pressable>
            </>
          )}
        </View>

        <AboutSection colors={colors} />

        <Pressable
          style={styles.logoutBtn}
          onPress={() =>
            Alert.alert('Выйти из аккаунта?', 'Вернуться можно в любое время.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Выйти', style: 'destructive', onPress: logout },
            ])
          }
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>Выйти из аккаунта</Text>
        </Pressable>
      </ScrollView>

      <TouchRipple ref={rippleRef} />
    </View>
  );
}

/** A labeled fact about the user — icon + small caption above, value below.
 * Used to be a rigid two-column table (fixed-width label | value), which read
 * as dry and squeezed longer multiline values against a 110px label column.
 * Stacking vertically gives values room to breathe, and a per-field icon
 * (matching the app's icon-heavy visual language elsewhere) breaks up what
 * would otherwise be a monotonous flat list of near-identical rows. */
function ProfileRow({
  icon,
  label,
  value,
  multiline,
  first,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  multiline?: boolean;
  first?: boolean;
  colors: ColorsType;
}) {
  return (
    <View style={[styles.profileRow, { borderTopColor: colors.border }, first && { borderTopWidth: 0 }]}>
      <View style={styles.profileRowLabelRow}>
        <Ionicons name={icon} size={14} color={colors.textMuted} />
        <Text style={[styles.profileRowLabel, { color: colors.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.profileRowValue, { color: colors.textPrimary }, multiline && styles.profileRowValueMultiline]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  profileCard: { overflow: 'hidden' },
  profileRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    gap: 4,
  },
  profileRowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileRowLabel: {
    ...typography.bodySmall,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileRowValue: { ...typography.body },
  profileRowValueMultiline: { lineHeight: 22 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountLabel: { ...typography.bodySmall, flexShrink: 0 },
  accountValue: { ...typography.bodySmall, flex: 1 },
  emptyCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyText: { ...typography.bodySemibold },
  emptySubtext: { ...typography.bodySmall },
  fillBtn: {
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  fillBtnText: { ...typography.bodySemibold },
  logoutBtn: { alignItems: 'center', padding: spacing.md },
  logoutText: { ...typography.body },
  companionCard: { padding: spacing.md, gap: spacing.sm },
  companionName: { fontSize: 20, fontFamily: typography.h3.fontFamily },
  editLink: { ...typography.bodySmall },
  renameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  renameEditCol: { gap: spacing.sm },
  renameInput: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, fontSize: 15 },
  saveBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontFamily: typography.bodySemibold.fontFamily },
  aboutText: { ...typography.body, lineHeight: 22 },
  aboutVersion: { ...typography.caption, marginTop: spacing.sm },
  featuresScroll: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  featureCard: {
    width: 148,
    padding: spacing.md,
    gap: spacing.xs,
  },
  featureTitle: { ...typography.bodySemibold },
  featureDesc: { ...typography.bodySmall, lineHeight: 18 },
});
