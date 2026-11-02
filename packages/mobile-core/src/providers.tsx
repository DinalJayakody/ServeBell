import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { ApiError } from '@servebell/api-client';
import { ThemeProvider, useThemeContext, type ThemeStorage } from '@servebell/design-system';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const THEME_KEY = 'servebell.theme';
const themeStorage: ThemeStorage = {
  get: () => AsyncStorage.getItem(THEME_KEY),
  set: (v) => AsyncStorage.setItem(THEME_KEY, v),
};

// Refetch stale data when the app returns to the foreground.
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
onlineManager.setOnline(true);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

function SplashGate({ children, extraReady }: { children: ReactNode; extraReady: boolean }) {
  const { ready, theme } = useThemeContext();
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const done = ready && (fontsLoaded || !!fontError) && extraReady;
  useEffect(() => {
    if (done) void SplashScreen.hideAsync().catch(() => undefined);
  }, [done]);
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>{done ? children : null}</View>;
}

export function AppProviders({ children, ready = true }: { children: ReactNode; ready?: boolean }) {
  const [client] = useState(() => queryClient);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <ThemeProvider storage={themeStorage}>
            <SplashGate extraReady={ready}>{children}</SplashGate>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
