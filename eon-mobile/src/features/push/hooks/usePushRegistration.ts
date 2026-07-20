import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { pushApi } from '../api';

/** Called once from `AppNavigator` (mounted only once the user is past the
 * auth/onboarding gate) — requests notification permission and registers
 * this device's Expo push token with the backend, so reminders
 * (see CLAUDE.md's Reminders notes) can actually reach the device.
 *
 * Needs `extra.eas.projectId` in app.json — `getExpoPushTokenAsync` throws
 * without it. That id only exists once this project has been linked to an
 * Expo account via `npx eas init` (a one-time, manual step tied to whoever's
 * Expo account owns the project — not something that can be generated from
 * here). Until that's done, this silently no-ops past the permission prompt.
 */
export function usePushRegistration() {
  useEffect(() => {
    (async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        let granted = existing.granted;
        if (!granted) {
          const requested = await Notifications.requestPermissionsAsync();
          granted = requested.granted;
        }
        if (!granted) return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return;

        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        await pushApi.register(token);
      } catch {
        // Best-effort — a failed push registration shouldn't block using the app.
      }
    })();
  }, []);
}
