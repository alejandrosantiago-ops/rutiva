import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { palette } from '@/theme/palette';
import { fromKey, shiftKey, timeToMinutes, todayKey } from '@/domain/dates';
import { describeTarget, isPaused, isScheduledOn } from '@/domain/habits';
import { waterReminderSlots } from '@/domain/water';
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

/** Días por delante que se programan cuando no basta con un aviso repetitivo. */
const ROLLING_DAYS = 14;
/** iOS admite como máximo 64 notificaciones pendientes por app. */
const MAX_PER_HABIT = 24;

/**
 * Cancela los recordatorios previos del hábito y programa los nuevos.
 * - Diario o días concretos sin fecha de fin → avisos repetitivos (DAILY/WEEKLY).
 * - Intervalos o con fecha de fin → avisos por fecha para los próximos 14 días;
 *   se renuevan cada vez que se abre la app (ver useBootstrap).
 * Devuelve los ids programados (vacío si no aplica o no hay permiso).
 */
export async function scheduleHabitReminders(habit: Habit, enabledGlobally: boolean): Promise<string[]> {
  await cancelNotifications(habit.notificationIds);
  if (!notificationsSupported || !enabledGlobally) return [];
  if (habit.reminderTimes.length === 0 || habit.archived || habit.deletedAt || isPaused(habit)) return [];
  if (!(await ensurePermission())) return [];

  const content: Notifications.NotificationContentInput = {
    title: habit.name,
    body:
      habit.trackingType === 'check'
        ? HABIT_MESSAGES[Math.floor(Math.random() * HABIT_MESSAGES.length)]
        : `Meta de hoy: ${describeTarget(habit)}. ${HABIT_MESSAGES[Math.floor(Math.random() * HABIT_MESSAGES.length)]}`,
    data: { url: `/habit/${habit.id}`, habitId: habit.id },
    sound: 'default',
  };
  const T = Notifications.SchedulableTriggerInputTypes;
  const ids: string[] = [];

  const repeating = !habit.endDate && (habit.frequency === 'daily' || habit.frequency === 'weekly');
  if (repeating) {
    for (const time of habit.reminderTimes) {
      const { hour, minute } = splitTime(time);
      if (habit.frequency === 'daily' || habit.daysOfWeek.length === 7) {
        ids.push(await Notifications.scheduleNotificationAsync({ content, trigger: { type: T.DAILY, hour, minute, channelId: CHANNEL_ID } }));
      } else {
        for (const day of habit.daysOfWeek) {
          // WEEKLY usa 1 = domingo … 7 = sábado.
          ids.push(
            await Notifications.scheduleNotificationAsync({
              content,
              trigger: { type: T.WEEKLY, weekday: day + 1, hour, minute, channelId: CHANNEL_ID },
            }),
          );
        }
      }
    }
    return ids;
  }

  const now = Date.now();
  const today = todayKey();
  for (let i = 0; i < ROLLING_DAYS && ids.length < MAX_PER_HABIT; i++) {
    const date = shiftKey(today, i);
    if (!isScheduledOn(habit, date)) continue;
    for (const time of habit.reminderTimes) {
      const at = fromKey(date);
      const { hour, minute } = splitTime(time);
      at.setHours(hour, minute, 0, 0);
      if (at.getTime() <= now) continue;
      ids.push(await Notifications.scheduleNotificationAsync({ content, trigger: { type: T.DATE, date: at, channelId: CHANNEL_ID } }));
    }
  }
  return ids;
}

/** Recordatorios de beber agua repartidos entre dos horas. */
export async function scheduleWaterReminders(
  opts: { enabled: boolean; start: TimeOfDay; end: TimeOfDay; everyMinutes: number; goalLabel: string },
  previousIds: string[],
): Promise<string[]> {
  await cancelNotifications(previousIds);
  if (!notificationsSupported || !opts.enabled || !(await ensurePermission())) return [];
  const slots = waterReminderSlots(timeToMinutes(opts.start), timeToMinutes(opts.end), opts.everyMinutes).slice(0, 16);
  const ids: string[] = [];
  for (const m of slots) {
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Hora de beber agua', body: `Un vaso más te acerca a tu meta de ${opts.goalLabel}.`, data: { url: '/water' }, sound: 'default' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Math.floor(m / 60),
          minute: m % 60,
          channelId: CHANNEL_ID,
        },
      }),
    );
  }
  return ids;
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
