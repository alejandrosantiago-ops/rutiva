import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { palette } from '@/theme/palette';
import { timeToMinutes } from '@/domain/dates';
import type { Habit, TimeOfDay } from '@/domain/types';

const CHANNEL_ID = 'recordatorios';
export const notificationsSupported = Platform.OS !== 'web';

/** Se llama una vez al arrancar la app. */
export async function configureNotifications() {
  if (!notificationsSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    // El canal debe existir antes de pedir permiso en Android 13+.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Recordatorios',
      description: 'Recordatorios de hábitos y de la hora de dormir',
      // eslint-disable-next-line import/namespace -- se re-exporta vía `export *`; el plugin no lo resuelve.
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: palette.brand[500],
      vibrationPattern: [0, 200, 120, 200],
    });
  }
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (!notificationsSupported) return 'denied';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Pide permiso si aún no se ha concedido. Devuelve si se puede notificar. */
export async function ensurePermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function cancelNotifications(ids: string[]) {
  if (!notificationsSupported) return;
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

function splitTime(time: TimeOfDay) {
  const m = timeToMinutes(time);
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

const HABIT_MESSAGES = [
  'Es un buen momento para cumplirlo.',
  'Un pequeño paso hoy suma mucho.',
  'Mantén viva tu racha.',
  'Tu yo de mañana te lo agradecerá.',
];

/**
 * Cancela los recordatorios previos del hábito y programa los nuevos.
 * Devuelve los ids programados (vacío si no aplica o no hay permiso).
 */
export async function scheduleHabitReminders(habit: Habit, enabledGlobally: boolean): Promise<string[]> {
  await cancelNotifications(habit.notificationIds);
  if (!notificationsSupported || !enabledGlobally) return [];
  if (!habit.reminderEnabled || !habit.reminderTime || habit.archived || habit.deletedAt) return [];
  if (!(await ensurePermission())) return [];

  const { hour, minute } = splitTime(habit.reminderTime);
  const content: Notifications.NotificationContentInput = {
    title: habit.name,
    body: HABIT_MESSAGES[Math.floor(Math.random() * HABIT_MESSAGES.length)],
    data: { url: '/', habitId: habit.id },
    sound: 'default',
  };

  if (habit.daysOfWeek.length === 7) {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
    });
    return [id];
  }

  // WEEKLY usa 1 = domingo … 7 = sábado.
  return Promise.all(
    habit.daysOfWeek.map((day) =>
      Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1,
          hour,
          minute,
          channelId: CHANNEL_ID,
        },
      }),
    ),
  );
}

export async function scheduleBedtimeReminder(time: TimeOfDay, previousId: string | null): Promise<string | null> {
  if (previousId) await cancelNotifications([previousId]);
  if (!notificationsSupported || !(await ensurePermission())) return null;
  const { hour, minute } = splitTime(time);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Hora de desconectar',
      body: 'Deja el móvil y prepárate para dormir. Mañana lo notarás.',
      data: { url: '/sleep' },
      sound: 'default',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
  });
}

export async function sendTestNotification(): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Rutiva', body: '¡Las notificaciones funcionan correctamente!', data: { url: '/' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_ID },
  });
  return true;
}

/** Limpieza total; útil al restablecer datos o desactivar notificaciones. */
export async function cancelAllNotifications() {
  if (!notificationsSupported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
