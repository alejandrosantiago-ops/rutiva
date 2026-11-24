import { formatWater } from '@/domain/water';
import { scheduleWaterReminders } from '@/services/notifications';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';

/** Reprograma los recordatorios de agua según los ajustes actuales y guarda los ids. */
export async function syncWaterReminders(): Promise<boolean> {
  const s = useSettingsStore.getState().settings;
  const enabled = s.waterReminderEnabled && s.notificationsEnabled;
  const ids = await scheduleWaterReminders(
    {
      enabled,
      start: s.waterReminderStart,
      end: s.waterReminderEnd,
      everyMinutes: s.waterReminderEveryMinutes,
      goalLabel: formatWater(s.waterGoalMl, s.waterUnit),
    },
    s.waterNotificationIds,
  );
  await useSettingsStore.getState().update('waterNotificationIds', ids);
  // false = estaba activado pero no se pudo programar (sin permiso).
  return !enabled || ids.length > 0;
}
