import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { OnboardingScreen } from '@/features/onboarding/screens/OnboardingScreen';
import { ChatScreen } from '@/features/chat/screens/ChatScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { colors } from '@/shared/theme';

export type AppStackParams = {
  Onboarding: undefined;
  Chat: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<AppStackParams>();

export function AppNavigator({ initialRoute }: { initialRoute: keyof AppStackParams }) {
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
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Мой профиль' }} />
    </Stack.Navigator>
  );
}
