import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { palette } from '@/theme/palette';
import { timeToMinutes } from '@/domain/dates';
import { describeTarget } from '@/domain/habits';
import { planHabitReminders } from '@/domain/reminders';
import { waterReminderSlots } from '@/domain/water';
import type { Habit, TimeOfDay } from '@/domain/types';
import { applyReminderPlan, type NotificationGateway } from './sync';

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

/** Pasarela real hacia expo-notifications (en las pruebas se usa una falsa). */
export const expoGateway: NotificationGateway = {
  async schedule(content, trigger) {
    const T = Notifications.SchedulableTriggerInputTypes;
    const input: Notifications.NotificationTriggerInput =
      trigger.type === 'daily'
        ? { type: T.DAILY, hour: trigger.hour, minute: trigger.minute, channelId: CHANNEL_ID }
        : trigger.type === 'weekly'
          ? { type: T.WEEKLY, weekday: trigger.weekday, hour: trigger.hour, minute: trigger.minute, channelId: CHANNEL_ID }
          : { type: T.DATE, date: trigger.at, channelId: CHANNEL_ID };
    return Notifications.scheduleNotificationAsync({ content: { ...content, sound: 'default' }, trigger: input });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
  },
};

/**
 * Cancela los avisos anteriores del hábito (`previousIds`) y programa los del
 * plan actual. Devuelve los ids nuevos agrupados por hora de recordatorio.
 */
export async function scheduleHabitReminders(
  habit: Habit,
  previousIds: string[],
  enabledGlobally: boolean,
): Promise<Record<TimeOfDay, string[]>> {
  if (!notificationsSupported) return {};
  const plan = planHabitReminders(habit, new Date(), enabledGlobally);
  if (plan.length > 0 && !(await ensurePermission())) {
    await cancelNotifications(previousIds);
    return {};
  }
  const message = HABIT_MESSAGES[Math.floor(Math.random() * HABIT_MESSAGES.length)];
  return applyReminderPlan(expoGateway, previousIds, plan, {
    title: habit.name,
    body: habit.trackingType === 'check' ? message : `Meta de hoy: ${describeTarget(habit)}. ${message}`,
    data: { url: `/habit/${habit.id}`, habitId: habit.id },
  });
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
