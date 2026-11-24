import * as Notifications from 'expo-notifications';
import { formatIsoTime } from '@/domain/dates';
import { cancelNotifications, ensurePermission, notificationsSupported } from './index';

/*
 * Avisos del cronómetro: uno fijo "en marcha" (para volver rápido) y otro
 * programado para cuando se alcance la meta, que llega aunque la app esté
 * cerrada. El tiempo real se calcula siempre con marcas de tiempo guardadas en
 * SQLite, así que no depende de que la app siga en segundo plano.
 */
let ongoingId: string | null = null;
let goalId: string | null = null;

export async function showTimerNotifications(opts: {
  habitId: string;
  habitName: string;
  runningSince: string;
  /** Minutos que faltan para la meta; ≤ 0 si ya se alcanzó. */
  remainingMinutes: number;
  targetMinutes: number;
}) {
  await clearTimerNotifications();
  if (!notificationsSupported || !(await ensurePermission())) return;
  const url = `/habit/log/${opts.habitId}`;
  ongoingId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Cronómetro en marcha · ${opts.habitName}`,
      body: `Desde las ${formatIsoTime(opts.runningSince)}. Toca para pausar o finalizar.`,
      data: { url },
      sticky: true,
      autoDismiss: false,
      sound: false,
    },
    trigger: null,
  });
  if (opts.remainingMinutes > 0) {
    goalId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '¡Meta alcanzada!',
        body: `Llevas ${opts.targetMinutes} min de ${opts.habitName}. Finaliza el cronómetro para guardarlo.`,
        data: { url },
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + opts.remainingMinutes * 60000) },
    });
  }
}

export async function clearTimerNotifications() {
  if (!notificationsSupported) return;
  const ids = [ongoingId, goalId].filter((x): x is string => !!x);
  ongoingId = null;
  goalId = null;
  await cancelNotifications(ids);
  await Promise.all(ids.map((id) => Notifications.dismissNotificationAsync(id).catch(() => undefined)));
}
