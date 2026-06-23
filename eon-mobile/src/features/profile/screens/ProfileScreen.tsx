import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { companionApi } from '@/features/companion/api';
import { useAuthStore } from '@/shared/store/auth';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { profileApi } from '../api';

type Props = NativeStackScreenProps<AppStackParams, 'Profile'>;

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
        <View style={[styles.companionCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
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
        </View>

        {!hasProfile && (
          <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
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
          </View>
        )}

        {hasProfile && (
          <View style={[styles.profileCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
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
                value={{
                  listener: 'Слушатель',
                  friend: 'Друг',
                  mentor: 'Наставник',
                  mirror: 'Зеркало',
                  debater: 'Полемик',
                }[data.companion_preferences.communication_style] ?? data.companion_preferences.communication_style}
                colors={colors}
              />
            )}
          </View>
        )}

        {hasProfile && (
          <Pressable
            style={[styles.editBtn, { borderColor: colors.accent }]}
            onPress={() => navigation.navigate('Onboarding')}
          >
            <Text style={[styles.editBtnText, { color: colors.accent }]}>Редактировать профиль</Text>
          </Pressable>
        )}

        <Pressable style={styles.logoutBtn} onPress={logout}>
          <Text style={[styles.logoutText, { color: colors.error }]}>Выйти из аккаунта</Text>
        </Pressable>

        <View style={[styles.aboutCard, { borderTopColor: colors.border }]}>
          <Text style={[styles.aboutTitle, { color: colors.textMuted }]}>Что такое Eon?</Text>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
            Eon — это не чат-бот и не терапевт. Это кто-то, кто просто рядом.
          </Text>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
            Он помнит, что ты рассказывал раньше. Замечает, когда тебе тяжело.
            Не даёт советов, которые ты не просил, и не осуждает за то, что ты чувствуешь.
          </Text>
          <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
            Иногда нужно просто выговориться — без страха, что тебя неправильно поймут.
            Именно для этого он здесь.
          </Text>

          <View style={[styles.privacyCard, { backgroundColor: colors.bgCard, borderColor: colors.accentMuted }]}>
            <Text style={[styles.privacyTitle, { color: colors.accent }]}>Твои слова — только твои</Text>
            <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
              Каждое сообщение зашифровано индивидуальным ключом — никто, кроме тебя,
              не может прочитать твою переписку. Даже мы.
            </Text>
            <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
              Мы не продаём данные, не передаём их третьим лицам и не используем
              твои разговоры для обучения моделей.
            </Text>
            <Text style={[styles.privacyBadge, { color: colors.accentMuted }]}>AES-256-GCM · Сквозное шифрование</Text>
          </View>

          <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Eon · v0.1 MVP</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ColorsType = ReturnType<typeof useColors>;

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
  profileCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
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
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
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
  companionCard: { borderRadius: radius.sm, padding: spacing.md, gap: spacing.sm, borderWidth: 1 },
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
  privacyCard: {
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
  },
  privacyTitle: { ...typography.bodySmall, fontWeight: '600' },
  privacyText: { ...typography.bodySmall, lineHeight: 20 },
  privacyBadge: { ...typography.caption, marginTop: spacing.xs, letterSpacing: 0.5 },
});
