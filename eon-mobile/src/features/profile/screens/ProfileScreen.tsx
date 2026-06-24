import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { companionApi } from '@/features/companion/api';
import { useAuthStore } from '@/shared/store/auth';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { GlassCard } from '@/shared/components/Glass';
import { profileApi } from '../api';

type Props = NativeStackScreenProps<AppStackParams, 'Profile'>;
type ColorsType = ReturnType<typeof useColors>;

const STYLE_LABELS: Record<string, string> = {
  listener: 'Слушатель',
  friend: 'Друг',
  mentor: 'Наставник',
  mirror: 'Зеркало',
  debater: 'Полемик',
};

const APP_FEATURES = [
  {
    icon: '🔐',
    title: 'Шифрование',
    desc: 'Данные зашифрованы твоим ключом — мы не можем их прочитать.',
  },
  {
    icon: '🧠',
    title: 'Память',
    desc: 'Помнит историю разговора между сессиями.',
  },
  {
    icon: '🎭',
    title: 'Стиль',
    desc: '5 режимов общения на выбор.',
  },
  {
    icon: '🤫',
    title: 'Без осуждений',
    desc: 'Говори о чём угодно.',
  },
  {
    icon: '🚫',
    title: 'Приватность',
    desc: 'Данные не продаём и не обучаем на них модели.',
  },
];

function AboutSection({ colors }: { colors: ColorsType }) {
  return (
    <View style={[styles.aboutCard, { borderTopColor: colors.border }]}>
      <Text style={[styles.aboutTitle, { color: colors.textMuted }]}>Что такое Eon?</Text>
      <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
        Персональный AI-компаньон для разговора. Помнит историю, подстраивается под твой стиль общения.
      </Text>

      <FlatList
        data={APP_FEATURES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.title}
        contentContainerStyle={styles.featuresScroll}
        renderItem={({ item }) => (
          <GlassCard style={styles.featureCard} borderRadius={radius.md} intensity={30}>
            <Text style={styles.featureIcon}>{item.icon}</Text>
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
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const [botName, setBotName] = useState('');
  const [editingName, setEditingName] = useState(false);

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

  const renameMutation = useMutation({
    mutationFn: (name: string) => companionApi.rename(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companion'] });
      setEditingName(false);
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const name = data?.basic_info?.preferred_name ?? 'Пользователь';
  const hasProfile = !!data?.basic_info?.preferred_name;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <GlassCard style={styles.companionCard}>
          {editingName ? (
            <View style={styles.renameRow}>
              <TextInput
                style={[styles.renameInput, { backgroundColor: colors.bgInput, borderColor: colors.accent, color: colors.textPrimary }]}
                value={botName}
                onChangeText={setBotName}
                placeholder="Введи имя..."
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                selectionColor={colors.accent}
              />
              <View style={styles.renameActions}>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.accent }]}
                  onPress={() => botName.trim() && renameMutation.mutate(botName.trim())}
                >
                  <Text style={styles.saveBtnText}>
                    {renameMutation.isPending ? '...' : 'Сохранить'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setEditingName(false)}>
                  <Text style={[styles.cancelText, { color: colors.textMuted }]}>Отмена</Text>
                </Pressable>
              </View>
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

        {!hasProfile && (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.textPrimary }]}>Профиль не заполнен</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Расскажи о себе, чтобы Eon мог лучше тебя понять
            </Text>
            <Pressable
              style={[styles.fillBtn, { backgroundColor: colors.accent }]}
              onPress={() => navigation.navigate('Onboarding')}
            >
              <Text style={styles.fillBtnText}>Заполнить профиль</Text>
            </Pressable>
          </GlassCard>
        )}

        {hasProfile && (
          <GlassCard style={styles.profileCard}>
            {data.basic_info.preferred_name && (
              <ProfileRow label="Имя" value={data.basic_info.preferred_name} first colors={colors} />
            )}
            {data.basic_info.age && (
              <ProfileRow label="Возраст" value={`${data.basic_info.age} лет`} colors={colors} />
            )}
            {data.basic_info.location && (
              <ProfileRow label="Город" value={data.basic_info.location} colors={colors} />
            )}
            {data.life_context.occupation && (
              <ProfileRow label="О себе" value={data.life_context.occupation} multiline colors={colors} />
            )}
            {data.life_context.family_status && (
              <ProfileRow label="Семья" value={data.life_context.family_status} multiline colors={colors} />
            )}
            {!!data.life_context.close_people?.length && (
              <ProfileRow label="Близкие" value={data.life_context.close_people.join(', ')} multiline colors={colors} />
            )}
            {!!data.life_context.values?.length && (
              <ProfileRow label="Ценности" value={data.life_context.values.join(', ')} multiline colors={colors} />
            )}
            {!!data.positive_moments.sources_of_energy?.length && (
              <ProfileRow label="Что даёт силы" value={data.positive_moments.sources_of_energy.join('\n')} multiline colors={colors} />
            )}
            {!!data.positive_moments.dreams?.length && (
              <ProfileRow label="Мечты" value={data.positive_moments.dreams.join(', ')} multiline colors={colors} />
            )}
            {!!data.struggles.coping_mechanisms?.length && (
              <ProfileRow label="Как справляюсь" value={data.struggles.coping_mechanisms.join('\n')} multiline colors={colors} />
            )}
            {!!data.struggles.anxiety_topics?.length && (
              <ProfileRow label="Что беспокоит" value={data.struggles.anxiety_topics.join(', ')} multiline colors={colors} />
            )}
            {data.companion_preferences?.communication_style && (
              <ProfileRow
                label="Стиль общения"
                value={STYLE_LABELS[data.companion_preferences.communication_style] ?? data.companion_preferences.communication_style}
                colors={colors}
              />
            )}
          </GlassCard>
        )}

        {hasProfile && (
          <Pressable
            style={[styles.editBtn, { borderColor: colors.accent }]}
            onPress={() => navigation.navigate('Onboarding')}
          >
            <Text style={[styles.editBtnText, { color: colors.accent }]}>Редактировать профиль</Text>
          </Pressable>
        )}

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

        <AboutSection colors={colors} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({
  label,
  value,
  multiline,
  first,
  colors,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  first?: boolean;
  colors: ColorsType;
}) {
  return (
    <View style={[styles.profileRow, { borderTopColor: colors.border }, first && { borderTopWidth: 0 }]}>
      <Text style={[styles.profileRowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.profileRowValue, { color: colors.textPrimary }, multiline && styles.profileRowValueMultiline]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  profileCard: { overflow: 'hidden' },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  profileRowLabel: {
    ...typography.bodySmall,
    width: 110,
    flexShrink: 0,
    paddingTop: 1,
  },
  profileRowValue: { ...typography.body, flex: 1 },
  profileRowValueMultiline: { lineHeight: 22 },
  emptyCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyText: { ...typography.body, fontWeight: '600' },
  emptySubtext: { ...typography.bodySmall },
  fillBtn: {
    padding: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  fillBtnText: { ...typography.body, color: '#fff', fontWeight: '600' },
  editBtn: { padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center' },
  editBtnText: { ...typography.body },
  logoutBtn: { marginTop: spacing.sm, alignItems: 'center', padding: spacing.md },
  logoutText: { ...typography.body },
  companionCard: { padding: spacing.md, gap: spacing.sm },
  companionName: { fontSize: 20, fontWeight: '600' },
  editLink: { ...typography.bodySmall },
  renameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  renameActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  renameInput: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, fontSize: 15 },
  saveBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelText: { ...typography.bodySmall },
  aboutCard: {
    marginTop: spacing.sm,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    gap: spacing.md,
  },
  aboutTitle: {
    ...typography.bodySmall,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
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
  featureIcon: { fontSize: 28 },
  featureTitle: { ...typography.body, fontWeight: '600' },
  featureDesc: { ...typography.bodySmall, lineHeight: 18 },
});
