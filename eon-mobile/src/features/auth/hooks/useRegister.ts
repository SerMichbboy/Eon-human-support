import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { generateE2EKeyPair, rawKeyToHeader } from '@/shared/crypto/e2e';
import { useAuthStore } from '@/shared/store/auth';
import { authApi } from '../api';

async function doRegisterEmail(email: string, password: string, setTokens: Function) {
  const { rawKey, salt, encryptedKey } = await generateE2EKeyPair(password);
  const rawKeyB64 = rawKeyToHeader(rawKey);
  await authApi.registerEmail(email, password, salt, encryptedKey);
  const { data } = await authApi.loginEmail(email, password);
  await setTokens(data.access_token, data.refresh_token, rawKeyB64);
}

async function doRegisterPhone(phone: string, password: string, setTokens: Function) {
  const { rawKey, salt, encryptedKey } = await generateE2EKeyPair(password);
  const rawKeyB64 = rawKeyToHeader(rawKey);
  await authApi.registerPhone(phone, password, salt, encryptedKey);
  const { data } = await authApi.loginPhone(phone, password);
  await setTokens(data.access_token, data.refresh_token, rawKeyB64);
}

function showPasswordWarning(onConfirm: () => void) {
  Alert.alert(
    '🔐 Запомни пароль',
    'Твои данные зашифрованы паролем. Если забудешь его — восстановить данные будет невозможно.\n\nЗапиши пароль в надёжном месте — на бумаге или в менеджере паролей.',
    [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Запомнил, продолжить', style: 'default', onPress: onConfirm },
    ],
  );
}

export function useRegisterEmail() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const mutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      doRegisterEmail(email, password, setTokens),
  });

  return {
    ...mutation,
    mutate: (vars: { email: string; password: string }) =>
      showPasswordWarning(() => mutation.mutate(vars)),
  };
}

export function useRegisterPhone() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const mutation = useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      doRegisterPhone(phone, password, setTokens),
  });

  return {
    ...mutation,
    mutate: (vars: { phone: string; password: string }) =>
      showPasswordWarning(() => mutation.mutate(vars)),
  };
}
