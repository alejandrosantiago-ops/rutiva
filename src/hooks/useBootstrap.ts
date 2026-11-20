import { useEffect, useState } from 'react';
import { colorScheme } from 'nativewind';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSleepStore } from '@/stores/useSleepStore';
import { useWaterStore } from '@/stores/useWaterStore';
import { configureNotifications } from '@/services/notifications';

/** Abre la base de datos, aplica migraciones y carga los stores. */
export function useBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const themeMode = useSettingsStore((s) => s.settings.themeMode);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await useSettingsStore.getState().load();
        colorScheme.set(useSettingsStore.getState().settings.themeMode);
        await Promise.all([
          useHabitStore.getState().load(),
          useSleepStore.getState().load(),
          useWaterStore.getState().load(),
        ]);
        if (!cancelled) setReady(true);
        // Renueva los recordatorios por fecha (intervalos, hábitos con fin) en segundo plano.
        configureNotifications()
          .then(() => {
            if (useSettingsStore.getState().settings.notificationsEnabled) return useHabitStore.getState().rescheduleAll();
          })
          .catch(() => undefined);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Aplica el tema elegido (sistema / claro / oscuro) cada vez que cambia.
  useEffect(() => {
    colorScheme.set(themeMode);
  }, [themeMode]);

  return { ready, error };
}
