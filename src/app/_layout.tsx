import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View, useColorScheme } from 'react-native';
import 'react-native-url-polyfill/auto';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { queryClient } from '@/lib/queryClient';

// This call prevents the native splash screen from hiding automatically during initialization.
SplashScreen.preventAutoHideAsync().catch(() => {});

// This component handles authentication guards and navigation redirects.
function RootNavigationLayout() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // This effect hides the native splash screen once authentication initialization is complete.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  // This effect synchronizes route protection with user authentication state.
  useEffect(() => {
    if (isLoading) {
      return;
    }

    const inAuthGroup = (segments as string[])[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, isLoading, segments, router]);

  // This effect intercepts the hardware back button when the user is logged out.
  useEffect(() => {
    const handleBackPress = () => {
      const inAuthGroup = (segments as string[])[0] === '(auth)';
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
    <View style={styles.rootContainer}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="offers/new"
          options={{
            headerShown: true,
            title: 'Nouvelle offre',
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTintColor: '#0F172A',
            headerTitleStyle: { color: '#0F172A', fontWeight: '600' },
          }}
        />
        <Stack.Screen
          name="offers/[id]"
          options={{
            headerShown: true,
            title: 'Détail de l’offre',
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTintColor: '#0F172A',
            headerTitleStyle: { color: '#0F172A', fontWeight: '600' },
          }}
        />
        <Stack.Screen
          name="applications/[id]"
          options={{
            headerShown: true,
            title: 'Détail candidature',
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTintColor: '#0F172A',
            headerTitleStyle: { color: '#0F172A', fontWeight: '600' },
          }}
        />
      </Stack>
    </View>
  );
}

// This root layout component provides global theme, query client and authentication context.
export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootNavigationLayout />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// This stylesheet defines display dimensions for the splash loading and root container.
const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
});
