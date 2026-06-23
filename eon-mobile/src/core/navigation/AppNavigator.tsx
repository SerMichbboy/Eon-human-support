import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { OnboardingScreen } from '@/features/onboarding/screens/OnboardingScreen';
import { ChatScreen } from '@/features/chat/screens/ChatScreen';
import { SettingsScreen } from '@/features/chat/screens/SettingsScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { useColors } from '@/shared/theme';

export type AppStackParams = {
  Onboarding: undefined;
  Chat: undefined;
  Settings: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<AppStackParams>();

export function AppNavigator({ initialRoute }: { initialRoute: keyof AppStackParams }) {
  const colors = useColors();
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgCard },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Eon' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Мой профиль' }} />
    </Stack.Navigator>
  );
}
