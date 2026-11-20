import '../../global.css';
import '@/lib/calendarLocale';

import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useTheme } from '@/theme/colors';
import { Txt } from '@/components/ui/primitives';

function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.navigate(url as never);
    });
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const { ready, error } = useBootstrap();
  const t = useTheme();
  useNotificationNavigation();

  const navTheme = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...navTheme,
    colors: { ...navTheme.colors, background: t.canvas, card: t.card, border: t.line, text: t.ink, primary: t.brand },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.canvas }}>
      <ThemeProvider value={theme}>
        <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
        {!ready ? (
          <View className="flex-1 items-center justify-center bg-canvas px-8 dark:bg-canvas-dark">
            {error ? (
              <>
                <Txt variant="heading" className="text-center">
                  No se pudo abrir la base de datos
                </Txt>
                <Txt variant="caption" className="mt-2 text-center">
                  {error.message}
                </Txt>
              </>
            ) : (
              <ActivityIndicator color={t.brand} />
            )}
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.canvas } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="habit/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="habit/edit/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="habit/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="habit/log/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="sleep/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="water" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          </Stack>
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
