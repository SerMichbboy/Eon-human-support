import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { profileApi } from '@/features/profile/api';
import { useAuthStore } from '@/shared/store/auth';
import { useSettingsStore } from '@/shared/store/settings';
import { SplashScreen } from '../components/SplashScreen';
import { AppNavigator, AppStackParams } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';

function hasFilledProfile(d: any): boolean {
  return !!(
    d?.basic_info?.preferred_name ||
    d?.life_context?.occupation ||
    d?.positive_moments?.sources_of_energy?.length ||
    d?.struggles?.coping_mechanisms?.length ||
    d?.companion_preferences?.communication_style
  );
}

export function RootNavigator() {
  const [storesReady, setStoresReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof AppStackParams>('Onboarding');
  // routeReady: false while profile check is in flight after login
  const [routeReady, setRouteReady] = useState(false);

  const { isAuthenticated, hydrate } = useAuthStore();
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  // One-time startup: hydrate stores + splash minimum
  useEffect(() => {
    const minDelay = new Promise<void>((res) => setTimeout(res, 2000));
    Promise.all([hydrate(), hydrateSettings(), minDelay]).finally(() => setStoresReady(true));
  }, []);

  // Re-check profile every time auth state changes to true
  useEffect(() => {
    if (!isAuthenticated) {
      setRouteReady(false);
      return;
    }
    setRouteReady(false);
    profileApi.get()
      .then((r) => setInitialRoute(hasFilledProfile(r.data) ? 'Chat' : 'Onboarding'))
      .catch(() => setInitialRoute('Onboarding'))
      .finally(() => setRouteReady(true));
  }, [isAuthenticated]);

  const showNav = storesReady && (isAuthenticated ? routeReady : true);

  return (
    <>
      {showNav && (
        <NavigationContainer>
          {isAuthenticated
            ? <AppNavigator initialRoute={initialRoute} />
            : <AuthNavigator />}
        </NavigationContainer>
      )}
      {!splashDone && (
        <SplashScreen onDone={() => setSplashDone(true)} />
      )}
    </>
  );
}
