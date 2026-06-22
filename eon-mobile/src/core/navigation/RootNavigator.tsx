import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { profileApi } from '@/features/profile/api';
import { useAuthStore } from '@/shared/store/auth';
import { AppNavigator, AppStackParams } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';

export function RootNavigator() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof AppStackParams>('Onboarding');
  const { isAuthenticated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate().then(async () => {
      const authed = useAuthStore.getState().isAuthenticated;
      if (authed) {
        try {
          const r = await profileApi.get();
          const hasProfile = !!r.data?.basic_info?.preferred_name;
          setInitialRoute(hasProfile ? 'Chat' : 'Onboarding');
        } catch {
          setInitialRoute('Onboarding');
        }
      }
    }).finally(() => setReady(true));
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#0F0F14' }} />;

  return (
    <NavigationContainer>
      {isAuthenticated
        ? <AppNavigator initialRoute={initialRoute} />
        : <AuthNavigator />}
    </NavigationContainer>
  );
}
