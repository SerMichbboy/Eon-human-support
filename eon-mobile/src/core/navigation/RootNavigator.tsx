import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { profileApi } from '@/features/profile/api';
import { useAuthStore } from '@/shared/store/auth';
import { useSettingsStore } from '@/shared/store/settings';
import { SplashScreen } from '../components/SplashScreen';
import { AppNavigator, AppStackParams } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';

export function RootNavigator() {
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof AppStackParams>('Onboarding');
  const { isAuthenticated, hydrate } = useAuthStore();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const readyTimeRef = useRef<number>(0);

  useEffect(() => {
    const minDelay = new Promise<void>((res) => setTimeout(res, 2000));

    const load = Promise.all([hydrate(), hydrateSettings()]).then(async () => {
      const authed = useAuthStore.getState().isAuthenticated;
      if (authed) {
        try {
          const r = await profileApi.get();
          const d = r.data;
          const hasAnyData = !!(
            d?.basic_info?.preferred_name ||
            d?.life_context?.occupation ||
            d?.positive_moments?.sources_of_energy?.length ||
            d?.struggles?.coping_mechanisms?.length ||
            d?.companion_preferences?.communication_style
          );
          setInitialRoute(hasAnyData ? 'Chat' : 'Onboarding');
        } catch {
          setInitialRoute('Onboarding');
        }
      }
    });

    Promise.all([load, minDelay]).finally(() => setReady(true));
  }, []);

  const showSplash = !splashDone;

  return (
    <>
      {ready && (
        <NavigationContainer>
          {isAuthenticated
            ? <AppNavigator initialRoute={initialRoute} />
            : <AuthNavigator />}
        </NavigationContainer>
      )}
      {showSplash && (
        <SplashScreen onDone={() => setSplashDone(true)} />
      )}
    </>
  );
}
