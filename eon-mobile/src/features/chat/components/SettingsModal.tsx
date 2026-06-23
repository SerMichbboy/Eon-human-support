import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { profileApi } from '@/features/profile/api';
import { BG_PRESETS, ThemeMode, useSettingsStore } from '@/shared/store/settings';
import { useColors, spacing, typography, radius } from '@/shared/theme';
import { PatternOverlay } from './PatternOverlay';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const STYLE_OPTIONS = [
  { id: 'listener', label: 'Слушатель',  desc: 'Просто рядом, без советов' },
  { id: 'friend',   label: 'Друг',       desc: 'Тепло, советует когда просят' },
  { id: 'mentor',   label: 'Наставник',  desc: 'Прямо и по существу' },
  { id: 'mirror',   label: 'Зеркало',    desc: 'Помогает думать вопросами' },
  { id: 'debater',  label: 'Полемик',    desc: 'Честная позиция, без уступок' },
];

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'dark',  label: 'Тёмная',  icon: '🌙' },
  { id: 'light', label: 'Светлая', icon: '☀️' },
];

export function SettingsModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { presetId, setPreset, themeMode, setThemeMode } = useSettingsStore();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
    enabled: visible,
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Настройки</Text>

        {/* Theme */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Тема</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const selected = themeMode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.themeBtn,
                    { borderColor: selected ? colors.accent : colors.border },
                    selected && { backgroundColor: colors.accentMuted },
                  ]}
                  onPress={() => setThemeMode(opt.id)}
                >
                  <Text style={styles.themeIcon}>{opt.icon}</Text>
                  <Text style={[styles.themeLabel, { color: selected ? colors.accent : colors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Style */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Стиль общения</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleRow}>
            {STYLE_OPTIONS.map((opt) => {
              const selected = currentStyle === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[
                    styles.styleCard,
                    { borderColor: selected ? colors.accent : colors.border },
                    selected && { backgroundColor: colors.accentMuted + '22' },
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
          </ScrollView>
        </View>

        {/* Background */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Фон чата</Text>
          <View style={styles.grid}>
            {BG_PRESETS.map((preset) => {
              const selected = presetId === preset.id;
              return (
                <Pressable key={preset.id} style={styles.presetWrap} onPress={() => setPreset(preset)}>
                  <View
                    style={[
                      styles.preview,
                      { backgroundColor: preset.color, borderColor: selected ? colors.accent : 'transparent' },
                    ]}
                  >
                    <PatternOverlay pattern={preset.pattern} color={preset.patternColor} />
                    {selected && (
                      <View style={[styles.checkCircle, { backgroundColor: colors.accent }]}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.presetLabel, { color: selected ? colors.accent : colors.textMuted }]}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...typography.h2 },
  section: { gap: spacing.md },
  sectionLabel: {
    ...typography.bodySmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  themeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  themeIcon: { fontSize: 16 },
  themeLabel: { ...typography.bodySmall, fontWeight: '600' },
  styleRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.xl },
  styleCard: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    width: 120,
    gap: 4,
  },
  styleLabel: { ...typography.body, fontWeight: '600' },
  styleDesc: { ...typography.caption, lineHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  presetWrap: { alignItems: 'center', gap: spacing.xs },
  preview: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  presetLabel: { ...typography.caption },
});
