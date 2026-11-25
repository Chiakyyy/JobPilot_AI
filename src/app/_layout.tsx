import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View, useColorScheme } from 'react-native';
import 'react-native-url-polyfill/auto';

import { AuthProvider, useAuth } from '@/context/AuthContext';

// This call prevents the native splash screen from hiding automatically during initialization.
SplashScreen.preventAutoHideAsync().catch(() => { });

// This component handles authentication guards and navigation redirects.
function RootNavigationLayout() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // This effect synchronizes route protection with user authentication state.
  useEffect(() => {
    if (isLoading) {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, isLoading, segments, router]);

  // This effect intercepts the hardware back button when the user is logged out.
  useEffect(() => {
    const handleBackPress = () => {
      const inAuthGroup = segments[0] === '(auth)';
      if (!session && inAuthGroup) {
        return false;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => {
      backSubscription.remove();
    };
  }, [session, segments]);

  // This condition renders a loading spinner until session verification finishes.
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

// This root layout component provides global theme and authentication context.
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigationLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}

// This stylesheet defines display dimensions for the splash loading container.
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
});
