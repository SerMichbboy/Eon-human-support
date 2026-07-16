import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/shared/components/Button';
import { EonLogo } from '@/shared/components/EonLogo';
import { FullscreenLoader } from '@/shared/components/FullscreenLoader';
import { Input } from '@/shared/components/Input';
import { IconButton } from '@/shared/components/IconButton';
import { useColors, spacing, typography } from '@/shared/theme';
import { useSettingsStore } from '@/shared/store/settings';
import { AuthStackParams } from '@/core/navigation/AuthNavigator';
import { useLogin } from '../hooks/useLogin';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const colors = useColors();
  const themeValue = useSettingsStore((s) => s.themeValue);
  const toggleThemeExtreme = useSettingsStore((s) => s.toggleThemeExtreme);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const login = useLogin();

  const handleLogin = async () => {
    try {
      await login.mutateAsync({ identifier, password });
      // Success — RootNavigator swaps to AppNavigator on its own once
      // setTokens() flips isAuthenticated, no explicit navigation needed.
    } catch (e: any) {
      if (e?.response?.status === 403) {
        // Registered but never verified — send them to enter the code
        // instead of just showing "account not verified" as a dead end.
        navigation.navigate('VerifyCode', { identifier, password, autoResend: true });
      }
      // Other errors stay visible via login.error below.
    }
  };

  return (
    <>
      <FullscreenLoader visible={login.isPending} message="Открываем твои данные…" />
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <EonLogo size={36} />
          <IconButton
            style={styles.themeBtn}
            hitSlop={12}
            onPress={() => toggleThemeExtreme()}
          >
            <Ionicons
              name={themeValue < 0.5 ? 'sunny-outline' : 'moon-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </IconButton>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.duration(400)}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Привет</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Я рад, что ты здесь</Text>

            <View style={styles.form}>
              <Input
                label="Email или телефон"
                placeholder="you@example.com или +79001234567"
                autoCapitalize="none"
                autoCorrect={false}
                value={identifier}
                onChangeText={setIdentifier}
              />
              <Input
                label="Пароль"
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                rightElement={
                  <IconButton onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                  </IconButton>
                }
              />
              {login.error && (login.error as any)?.response?.status !== 403 && (
                <Text style={[styles.error, { color: colors.error }]}>Неверный логин или пароль</Text>
              )}
              <Button title="Войти" onPress={handleLogin} loading={login.isPending} />
            </View>

            <Pressable onPress={() => navigation.navigate('Register')}>
              <Text style={[styles.link, { color: colors.accent }]}>Нет аккаунта? Создать</Text>
            </Pressable>
          </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    height: 52,
  },
  themeBtn: { padding: spacing.xs },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.h1, marginBottom: spacing.xs },
  subtitle: { ...typography.body, marginBottom: spacing.xl },
  form: { gap: spacing.md, marginBottom: spacing.xl },
  error: { ...typography.bodySmall },
  link: { ...typography.bodySmall, textAlign: 'center' },
});
