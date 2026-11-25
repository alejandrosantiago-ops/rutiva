import { useEffect, useState } from 'react';
import { colorScheme } from 'nativewind';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useWaterStore } from '@/features/water/store/useWaterStore';
import { useTimerStore } from '@/features/habits/store/timer';
import { useSleepSessionStore } from '@/features/sleep/store/sleepSession';
import { configureNotifications } from '@/services/notifications';
import { configureWakeNotifications } from '@/services/notifications/wake';
import { useWakeStore } from '@/features/alarm/store/useWakeStore';
import { useSyncStore } from '@/features/account/store/useSyncStore';
import { AppState } from 'react-native';

/** Abre la base de datos, aplica migraciones y carga los stores. */
export function useBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const themeMode = useSettingsStore((s) => s.settings.themeMode);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        await useSettingsStore.getState().load();
        colorScheme.set(useSettingsStore.getState().settings.themeMode);
        await Promise.all([
          useHabitStore.getState().load(),
          useSleepStore.getState().load(),
          useWaterStore.getState().load(),
          useSleepSessionStore.getState().load(),
          useWakeStore.getState().load(),
        ]);
        // Después de los hábitos: su aviso "en marcha" necesita el nombre del hábito.
        await useTimerStore.getState().load();
        if (!cancelled) setReady(true);
        // Sincronización opcional: solo si hay cuenta; en segundo plano y sin bloquear.
        useSyncStore
          .getState()
          .init()
          .then(() => useSyncStore.getState().syncNow({ auto: true }))
          .catch(() => undefined);
        // Renueva los recordatorios por fecha (intervalos, hábitos con fin) en segundo plano.
        configureNotifications()
          .then(() => configureWakeNotifications())
          .then(() => {
            if (!useSettingsStore.getState().settings.notificationsEnabled) return;
            return Promise.all([useHabitStore.getState().rescheduleAll(), useWakeStore.getState().rescheduleAll()]);
          })
          .catch(() => undefined);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Al volver a la app, sincroniza si hay cuenta (como mucho una vez por minuto).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') useSyncStore.getState().syncNow({ auto: true }).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  // Aplica el tema elegido (sistema / claro / oscuro) cada vez que cambia.
  useEffect(() => {
    colorScheme.set(themeMode);
  }, [themeMode]);

  return { ready, error, retry: () => setAttempt((n) => n + 1) };
}
