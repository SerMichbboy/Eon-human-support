import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/shared/components/Button';
import { FullscreenLoader } from '@/shared/components/FullscreenLoader';
import { Input } from '@/shared/components/Input';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { AuthStackParams } from '@/core/navigation/AuthNavigator';
import { useRegisterEmail, useRegisterPhone } from '../hooks/useRegister';

type Props = NativeStackScreenProps<AuthStackParams, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const colors = useColors();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const registerEmail = useRegisterEmail();
  const registerPhone = useRegisterPhone();
  const isLoading = registerEmail.isPending || registerPhone.isPending;
  const error = registerEmail.error || registerPhone.error;

  const handleRegister = () => {
    setPasswordError('');
    if (password.length < 8) { setPasswordError('Пароль — минимум 8 символов'); return; }
    if (mode === 'email') registerEmail.mutate({ email, password });
    else registerPhone.mutate({ phone, password });
  };

  return (
    <>
    <FullscreenLoader visible={isLoading} message="Генерируем ключ шифрования…" />
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.textPrimary }]}>Создать аккаунт</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Это займёт меньше минуты</Text>

        <View style={styles.modeRow}>
          {(['email', 'phone'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.modeBtn, { borderColor: mode === m ? colors.accent : colors.border }, mode === m && { backgroundColor: colors.accentMuted }]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeBtnText, { color: mode === m ? colors.accent : colors.textSecondary }, mode === m && { fontWeight: '600' }]}>
                {m === 'email' ? 'Email' : 'Телефон'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.form}>
          {mode === 'email' ? (
            <Input label="Email" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          ) : (
            <Input label="Телефон" placeholder="+79001234567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          )}
          <Input label="Пароль" placeholder="Минимум 8 символов" secureTextEntry value={password} onChangeText={setPassword} error={passwordError} />
          {error && <Text style={[styles.error, { color: colors.error }]}>Ошибка: {(error as any)?.response?.data?.detail ?? (error as Error)?.message ?? 'Попробуй ещё раз'}</Text>}
          <Button title="Зарегистрироваться" loading={isLoading} onPress={handleRegister} />
        </View>

        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={[styles.link, { color: colors.accent }]}>Уже есть аккаунт? Войти</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.h1, marginBottom: spacing.xs },
  subtitle: { ...typography.body, marginBottom: spacing.xl },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  modeBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center' },
  modeBtnText: { ...typography.bodySmall },
  form: { gap: spacing.md, marginBottom: spacing.xl },
  error: { ...typography.bodySmall },
  link: { ...typography.bodySmall, textAlign: 'center' },
});
