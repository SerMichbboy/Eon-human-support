import { useMutation } from '@tanstack/react-query';
import { generateE2EKeyPair } from '@/shared/crypto/e2e';
import { platformAlert } from '@/shared/utils/platformAlert';
import { authApi } from '../api';

function showPasswordWarning(onConfirm: () => void, onCancel: () => void) {
  platformAlert(
    '🔐 Запомни пароль',
    'Твои данные зашифрованы паролем. Если забудешь его — восстановить данные будет невозможно.\n\nЗапиши пароль в надёжном месте — на бумаге или в менеджере паролей.',
    [
      { text: 'Отмена', style: 'cancel', onPress: onCancel },
      { text: 'Запомнил, продолжить', style: 'default', onPress: onConfirm },
    ],
  );
}

/** Registration no longer logs the user in directly — the account exists but
 * isn't verified yet (server sends a code on /register); the caller
 * navigates to VerifyCode and completes login there once the code checks out. */
export function useRegister() {
  const mutation = useMutation({
    mutationFn: async ({ identifier, password }: { identifier: string; password: string }) => {
      const { salt, encryptedKey, pbkdf2C } = await generateE2EKeyPair(password);
      await authApi.register(identifier, password, salt, encryptedKey, pbkdf2C);
    },
  });

  const registerWithWarning = (vars: { identifier: string; password: string }): Promise<void> =>
    new Promise((resolve, reject) => {
      showPasswordWarning(
        () => mutation.mutateAsync(vars).then(resolve, reject),
        () => reject(new Error('cancelled')),
      );
    });

  return { ...mutation, registerWithWarning };
}
