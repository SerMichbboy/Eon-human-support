import {
  Onest_300Light,
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  useFonts,
} from '@expo-google-fonts/onest';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeAnimationProvider } from '@/shared/theme/ThemeAnimation';
import { QueryProvider } from './providers/QueryProvider';
import { RootNavigator } from './navigation/RootNavigator';

export default function App() {
  const [fontsLoaded] = useFonts({
    Onest_300Light,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#10121A' }} />;
  }

  return (
    <SafeAreaProvider>
      <ThemeAnimationProvider>
        <QueryProvider>
          <RootNavigator />
        </QueryProvider>
      </ThemeAnimationProvider>
    </SafeAreaProvider>
  );
}
