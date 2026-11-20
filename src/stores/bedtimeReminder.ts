import { cancelNotifications, scheduleBedtimeReminder } from '@/services/notifications';
import { useSettingsStore } from './useSettingsStore';

/**
 * Reprograma el recordatorio nocturno según los ajustes actuales.
 * Devuelve false si estaba activado pero no se pudo programar (sin permiso).
 */
export async function syncBedtimeReminder(): Promise<boolean> {
  const { settings, update } = useSettingsStore.getState();
  const previous = settings.bedtimeNotificationId;
  if (settings.bedtimeReminderEnabled && settings.notificationsEnabled) {
    const id = await scheduleBedtimeReminder(settings.bedtimeReminderTime, previous);
    await update('bedtimeNotificationId', id);
    return !!id;
  }
  if (previous) await cancelNotifications([previous]);
  await update('bedtimeNotificationId', null);
  return true;
}
