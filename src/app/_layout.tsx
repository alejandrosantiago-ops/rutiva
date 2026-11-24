import '../../global.css';
import '@/lib/calendarLocale';

import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Logo } from '@/ui/Logo';

import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useTheme } from '@/theme/colors';
import { Button, Txt } from '@/ui/primitives';
import { ToastHost } from '@/ui/toast';
import { RotateCcw } from 'lucide-react-native';
import type { ErrorBoundaryProps } from 'expo-router';

// El logo nativo se mantiene hasta que los datos estén listos (ver abajo).
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 350 });

/** Tiempo mínimo con el logo en pantalla, para que se vea y no parpadee. */
const MIN_SPLASH_MS = 800;

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

/** Pantalla de error si algo falla al renderizar (en lugar de cerrarse la app). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-8 dark:bg-canvas-dark">
      <Txt variant="heading" className="text-center">
        Algo salió mal
      </Txt>
      <Txt variant="caption" className="mt-2 text-center">
        {error.message}
      </Txt>
      <Txt variant="caption" className="mt-1 text-center">
        Tus datos están a salvo en el dispositivo.
      </Txt>
      <Button className="mt-6 w-48" title="Reintentar" icon={RotateCcw} onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const { ready: dataReady, error, retry } = useBootstrap();
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(id);
  }, []);
  const ready = dataReady && minElapsed;
  useEffect(() => {
    if (ready || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, error]);
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
                <Button className="mt-6 w-48" title="Reintentar" icon={RotateCcw} onPress={retry} />
              </>
            ) : (
              <>
                <Logo size={128} />
                <Txt variant="title" className="mt-5">
                  Rutiva
                </Txt>
                <ActivityIndicator className="mt-6" color={t.brand} />
              </>
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
            <Stack.Screen name="welcome" options={{ animation: 'fade', gestureEnabled: false }} />
          </Stack>
        )}
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
