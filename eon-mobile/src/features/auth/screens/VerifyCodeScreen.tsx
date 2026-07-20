import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/shared/components/Button';
import { EonLogo } from '@/shared/components/EonLogo';
import { FullscreenLoader } from '@/shared/components/FullscreenLoader';
import { IconButton } from '@/shared/components/IconButton';
import { useColors, radius, spacing, typography } from '@/shared/theme';
import { useAuthStore } from '@/shared/store/auth';
import { AuthStackParams } from '@/core/navigation/AuthNavigator';
import { authApi } from '../api';
import { completeLoginFromTokens } from '../hooks/useLogin';

type Props = NativeStackScreenProps<AuthStackParams, 'VerifyCode'>;

// Matches settings.verification_resend_cooldown_seconds on the backend —
// the server actually enforces this (a /resend-code before it elapses gets
// a 429), this is just so the button doesn't sit there inviting a tap that's
// guaranteed to fail.
const RESEND_COOLDOWN_SECONDS = 30;

export function VerifyCodeScreen({ navigation, route }: Props) {
  const { identifier, password, autoResend } = route.params;
  const colors = useColors();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(autoResend ? RESEND_COOLDOWN_SECONDS : 0);

  const sendCode = async () => {
    setIsResending(true);
    setResendNotice('');
    try {
      await authApi.resendCode(identifier);
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setResendNotice('Код отправлен');
    } catch (e: any) {
      if (e?.response?.status === 429) {
        setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      } else {
        setResendNotice('Не получилось отправить код — попробуй ещё раз');
      }
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    // Arriving fresh from Register: the server already sent a code as part
    // of /auth/register, so the cooldown clock started there — just mirror
    // it client-side instead of sending a redundant second code.
    // Arriving from Login's "not verified" (autoResend): the original code
    // may be long gone, so send a fresh one now.
    if (autoResend) {
      sendCode();
    } else {
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const handleVerify = async () => {
    setError('');
    setIsVerifying(true);
    try {
      await authApi.verifyCode(identifier, code);
      const { data } = await authApi.login(identifier, password);
      await completeLoginFromTokens(identifier, password, data, setTokens);
      // Success — RootNavigator swaps to AppNavigator once isAuthenticated
      // flips, no explicit navigation needed.
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Неверный или истёкший код');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      <FullscreenLoader visible={isVerifying} message="Подтверждаем и входим…" />
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top']}>
        <View style={styles.topBar}>
          <IconButton hitSlop={12} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </IconButton>
          <EonLogo size={32} />
          <View style={styles.topBarSpacer} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInUp.duration(400)}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Подтверди аккаунт</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Мы отправили код на {identifier}
              </Text>

              <TextInput
                style={[styles.codeInput, { backgroundColor: colors.bgInput, borderColor: error ? colors.error : colors.border, color: colors.textPrimary }]}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="0000"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                autoFocus
              />
              {!!error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

              <Button
                title="Подтвердить"
                onPress={handleVerify}
                loading={isVerifying}
                disabled={code.length !== 4}
              />

              <View style={styles.resendRow}>
                {secondsLeft > 0 ? (
                  <Text style={[styles.resendHint, { color: colors.textMuted }]}>
                    Отправить код ещё раз можно через {secondsLeft}с
                  </Text>
                ) : (
                  <Pressable onPress={sendCode} disabled={isResending}>
                    <Text style={[styles.resendLink, { color: colors.accent }]}>
                      {isResending ? 'Отправляем…' : 'Отправить код ещё раз'}
                    </Text>
                  </Pressable>
                )}
                {!!resendNotice && (
                  <Text style={[styles.resendHint, { color: colors.textMuted }]}>{resendNotice}</Text>
                )}
              </View>
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
  topBarSpacer: { width: 40 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  title: { ...typography.h1, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { ...typography.body, marginBottom: spacing.xl, textAlign: 'center' },
  codeInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    fontSize: 32,
    letterSpacing: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  error: { ...typography.bodySmall, textAlign: 'center', marginBottom: spacing.md },
  resendRow: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  resendHint: { ...typography.bodySmall },
  resendLink: { ...typography.bodySmall, fontFamily: typography.bodySemibold.fontFamily },
});
