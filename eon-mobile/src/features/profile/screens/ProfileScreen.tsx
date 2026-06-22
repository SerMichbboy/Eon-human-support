import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppStackParams } from '@/core/navigation/AppNavigator';
import { companionApi } from '@/features/companion/api';
import { useAuthStore } from '@/shared/store/auth';
import { colors, spacing, typography } from '@/shared/theme';
import { profileApi } from '../api';

type Props = NativeStackScreenProps<AppStackParams, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
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
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const name = data?.basic_info?.preferred_name ?? 'Пользователь';
  const hasProfile = !!data?.basic_info?.preferred_name;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.companionCard}>
          {editingName ? (
            <View style={styles.renameRow}>
              <TextInput
                style={styles.renameInput}
                value={botName}
                onChangeText={setBotName}
                placeholder="Введи имя..."
                placeholderTextColor={colors.textMuted}
                keyboardAppearance="dark"
                autoCorrect={false}
                selectionColor={colors.accent}
              />
              <View style={styles.renameActions}>
                <Pressable
                  style={styles.saveBtn}
                  onPress={() => botName.trim() && renameMutation.mutate(botName.trim())}
                >
                  <Text style={styles.saveBtnText}>
                    {renameMutation.isPending ? '...' : 'Сохранить'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setEditingName(false)}>
                  <Text style={styles.cancelText}>Отмена</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.renameRow}>
              <Text style={styles.companionName}>{companion?.name ?? 'Eon'}</Text>
              <Pressable onPress={() => { setBotName(companion?.name ?? 'Eon'); setEditingName(true); }}>
                <Text style={styles.editLink}>Изменить</Text>
              </Pressable>
            </View>
          )}
        </View>

        {!hasProfile && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Профиль не заполнен</Text>
            <Text style={styles.emptySubtext}>
              Расскажи о себе, чтобы Eon мог лучше тебя понять
            </Text>
            <Pressable
              style={styles.fillBtn}
              onPress={() => navigation.navigate('Onboarding')}
            >
              <Text style={styles.fillBtnText}>Заполнить профиль</Text>
            </Pressable>
          </View>
        )}

        {hasProfile ? (
          <View style={styles.profileCard}>
            {data.basic_info.preferred_name ? (
              <ProfileRow label="Имя" value={data.basic_info.preferred_name} first />
            ) : null}
            {data.basic_info.age ? (
              <ProfileRow label="Возраст" value={`${data.basic_info.age} лет`} />
            ) : null}
            {data.basic_info.location ? (
              <ProfileRow label="Город" value={data.basic_info.location} />
            ) : null}
            {data.life_context.occupation ? (
              <ProfileRow label="О себе" value={data.life_context.occupation} multiline />
            ) : null}
            {data.life_context.family_status ? (
              <ProfileRow label="Семья" value={data.life_context.family_status} multiline />
            ) : null}
            {data.life_context.close_people?.length ? (
              <ProfileRow label="Близкие" value={data.life_context.close_people.join(', ')} multiline />
            ) : null}
            {data.life_context.values?.length ? (
              <ProfileRow label="Ценности" value={data.life_context.values.join(', ')} multiline />
            ) : null}
            {data.positive_moments.sources_of_energy?.length ? (
              <ProfileRow label="Что даёт силы" value={data.positive_moments.sources_of_energy.join('\n')} multiline />
            ) : null}
            {data.positive_moments.dreams?.length ? (
              <ProfileRow label="Мечты" value={data.positive_moments.dreams.join(', ')} multiline />
            ) : null}
            {data.struggles.coping_mechanisms?.length ? (
              <ProfileRow label="Как справляюсь" value={data.struggles.coping_mechanisms.join('\n')} multiline />
            ) : null}
            {data.struggles.anxiety_topics?.length ? (
              <ProfileRow label="Что беспокоит" value={data.struggles.anxiety_topics.join(', ')} multiline />
            ) : null}
            {data.companion_preferences?.directiveness ? (
              <ProfileRow
                label="Стиль общения"
                value={data.companion_preferences.directiveness === 'advisor' ? 'Даёт советы когда прошу' : 'Просто слушает'}
              />
            ) : null}
          </View>
        ) : null}

        {hasProfile && (
          <Pressable style={styles.editBtn} onPress={() => navigation.navigate('Onboarding')}>
            <Text style={styles.editBtnText}>Редактировать профиль</Text>
          </Pressable>
        )}

        <Pressable style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>

        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>Что такое Eon?</Text>
          <Text style={styles.aboutText}>
            Eon — это не чат-бот и не терапевт. Это кто-то, кто просто рядом.
          </Text>
          <Text style={styles.aboutText}>
            Он помнит, что ты рассказывал раньше. Замечает, когда тебе тяжело.
            Не даёт советов, которые ты не просил, и не осуждает за то, что ты чувствуешь.
          </Text>
          <Text style={styles.aboutText}>
            Иногда нужно просто выговориться — без страха, что тебя неправильно поймут.
            Именно для этого он здесь.
          </Text>

          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>Твои слова — только твои</Text>
            <Text style={styles.privacyText}>
              Каждое сообщение зашифровано индивидуальным ключом — никто, кроме тебя,
              не может прочитать твою переписку. Даже мы.
            </Text>
            <Text style={styles.privacyText}>
              Мы не продаём данные, не передаём их третьим лицам и не используем
              твои разговоры для обучения моделей.
            </Text>
            <Text style={styles.privacyBadge}>AES-256-GCM · Сквозное шифрование</Text>
          </View>

          <Text style={styles.aboutVersion}>Eon · v0.1 MVP</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({ label, value, multiline, first }: { label: string; value: string; multiline?: boolean; first?: boolean }) {
  return (
    <View style={[styles.profileRow, first && { borderTopWidth: 0 }]}>
      <Text style={styles.profileRowLabel}>{label}</Text>
      <Text style={[styles.profileRowValue, multiline && styles.profileRowValueMultiline]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  name: { ...typography.h1 },
  profileCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  profileRowLabel: {
    ...typography.bodySmall,
    color: colors.textMuted,
    width: 110,
    flexShrink: 0,
    paddingTop: 1,
  },
  profileRowValue: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
  },
  profileRowValueMultiline: {
    lineHeight: 22,
  },
  detailRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  detail: { ...typography.body, color: colors.textSecondary },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { ...typography.body, fontWeight: '600' },
  emptySubtext: { ...typography.bodySmall, color: colors.textSecondary },
  fillBtn: {
    backgroundColor: colors.accent,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  fillBtnText: { ...typography.body, color: '#fff', fontWeight: '600' },
  editBtn: { padding: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, alignItems: 'center' },
  editBtnText: { ...typography.body, color: colors.accent },
  logoutBtn: { marginTop: spacing.sm, alignItems: 'center', padding: spacing.md },
  logoutText: { ...typography.body, color: colors.error },
  companionCard: { backgroundColor: colors.bgCard, borderRadius: 12, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  companionName: { fontSize: 20, fontWeight: '600', color: colors.textPrimary },
  editLink: { ...typography.bodySmall, color: colors.accent },
  renameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  renameActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  renameInput: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.accent, borderRadius: 10, padding: spacing.sm, fontSize: 15, color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelText: { color: colors.textMuted, ...typography.bodySmall },
  aboutCard: {
    marginTop: spacing.sm,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  aboutTitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  aboutText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  aboutVersion: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  privacyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  privacyTitle: {
    ...typography.bodySmall,
    color: colors.accent,
    fontWeight: '600',
  },
  privacyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  privacyBadge: {
    ...typography.caption,
    color: colors.accentMuted,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
});
