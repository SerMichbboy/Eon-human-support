import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { colors, spacing, typography } from '@/shared/theme';
import { AuthStackParams } from '@/core/navigation/AuthNavigator';
import { useLoginEmail, useLoginPhone } from '../hooks/useLogin';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const loginEmail = useLoginEmail();
  const loginPhone = useLoginPhone();

  const isLoading = loginEmail.isPending || loginPhone.isPending;
  const error = loginEmail.error || loginPhone.error;

  const handleLogin = () => {
    if (mode === 'email') {
      loginEmail.mutate({ email, password });
    } else {
      loginPhone.mutate({ phone, password });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Привет</Text>
        <Text style={styles.subtitle}>Я рад, что ты здесь</Text>

        <View style={styles.modeRow}>
          {(['email', 'phone'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'email' ? 'Email' : 'Телефон'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.form}>
          {mode === 'email' ? (
            <Input
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          ) : (
            <Input
              label="Телефон"
              placeholder="+79001234567"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          )}
          <Input
            label="Пароль"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error && (
            <Text style={styles.error}>Неверный логин или пароль</Text>
          )}
          <Button title="Войти" loading={isLoading} onPress={handleLogin} />
        </View>

        <Pressable onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>Нет аккаунта? Создать</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.h1, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  modeBtnText: { ...typography.bodySmall, color: colors.textSecondary },
  modeBtnTextActive: { color: colors.accent, fontWeight: '600' },
  form: { gap: spacing.md, marginBottom: spacing.xl },
  error: { ...typography.bodySmall, color: colors.error },
  link: { ...typography.bodySmall, color: colors.accent, textAlign: 'center' },
});
