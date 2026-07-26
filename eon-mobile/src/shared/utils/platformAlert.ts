import { Alert, Platform } from 'react-native';

type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

/**
 * react-native-web's `Alert.alert` is a literal no-op
 * (`node_modules/react-native-web/dist/cjs/exports/Alert/index.js`:
 * `static alert() {}`) — it never renders anything and never calls any
 * button's `onPress`. Any flow that awaits one of those callbacks (e.g.
 * registration's password-warning confirm in `useRegister.ts`) hangs
 * forever on web, with no dialog for the user to even dismiss. This wraps
 * `window.confirm`/`window.alert` on web instead, and delegates straight to
 * the real `Alert.alert` everywhere else.
 */
export function platformAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }
  if (buttons.length === 1) {
    window.alert(text);
    buttons[0].onPress?.();
    return;
  }

  // window.confirm only ever gives one OK/Cancel choice, so with more than
  // one button the cancel-styled one maps to Cancel and everything else
  // (there's normally just one other) maps to OK.
  const cancelButton = buttons.find((b) => b.style === 'cancel') ?? buttons[0];
  const confirmButton = buttons.find((b) => b !== cancelButton) ?? buttons[buttons.length - 1];
  if (window.confirm(text)) {
    confirmButton.onPress?.();
  } else {
    cancelButton.onPress?.();
  }
}
