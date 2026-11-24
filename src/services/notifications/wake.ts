import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { planWakeAlarm, snoozeTrigger, WAKE_SOUNDS } from '@/domain/wake';
import type { ReminderTrigger } from '@/domain/reminders';
import type { WakeAlarm, WakeSound } from '@/domain/types';
import { cancelNotifications, ensurePermission, notificationsSupported } from './index';

/*
 * Despertador en modo "Rutiva": avisos locales con prioridad de alarma.
 *
 * Android: entrega `alarmClock` (AlarmManager.setAlarmClock, exacta y sin
 * retrasos por batería; muestra el icono de alarma en la barra de estado),
 * canal con uso de audio ALARM (suena con el volumen de alarma), importancia
 * máxima, salta el modo No molestar y es visible en la pantalla bloqueada.
 *
 * Sigue siendo una notificación: el sonido dura lo que el archivo (25 s) y no
 * ocupa la pantalla. Para una alarma que suene hasta apagarla está el modo
 * "Reloj del sistema" (ver modules/rutiva-alarm).
 *
 * iOS: aviso con sonido y nivel "time sensitive". iOS no permite a las apps
 * crear alarmas del sistema salvo con AlarmKit (iOS 26+).
 */

export const WAKE_CATEGORY = 'wake-alarm';
export const WAKE_ACTION_SNOOZE = 'snooze';
export const WAKE_ACTION_AWAKE = 'awake';

/** En Expo Go no se pueden incluir sonidos propios: se usa el del sistema. */
const customSoundsAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

function soundFor(sound: WakeSound): string | null {
  return customSoundsAvailable ? WAKE_SOUNDS[sound].file : null;
}

/** Android fija el sonido al crear el canal, así que hay un canal por sonido. */
function channelFor(sound: WakeSound): string {
  return `despertador-${soundFor(sound) ? sound : 'default'}`;
}

export async function configureWakeNotifications() {
  if (!notificationsSupported) return;
  if (Platform.OS === 'android') {
    for (const sound of Object.keys(WAKE_SOUNDS) as WakeSound[]) {
      const file = soundFor(sound);
      await Notifications.setNotificationChannelAsync(channelFor(sound), {
        name: `Despertador · ${file ? WAKE_SOUNDS[sound].label : 'Sonido del sistema'}`,
        description: 'Alarmas para despertar',
        // eslint-disable-next-line import/namespace -- se re-exporta vía `export *`; el plugin no lo resuelve.
        importance: Notifications.AndroidImportance.MAX,
        sound: file ?? 'default',
        // eslint-disable-next-line import/namespace
        audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
        bypassDnd: true,
        enableVibrate: true,
        vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800],
        // eslint-disable-next-line import/namespace
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
  }
  await Notifications.setNotificationCategoryAsync(WAKE_CATEGORY, [
    { identifier: WAKE_ACTION_SNOOZE, buttonTitle: 'Posponer', options: { opensAppToForeground: false } },
    { identifier: WAKE_ACTION_AWAKE, buttonTitle: 'Ya estoy despierto', options: { opensAppToForeground: true } },
  ]);
}

function toTrigger(trigger: ReminderTrigger, alarm: WakeAlarm): Notifications.NotificationTriggerInput {
  const T = Notifications.SchedulableTriggerInputTypes;
  const channelId = channelFor(alarm.sound);
  const delivery = 'alarmClock' as const;
  if (trigger.type === 'daily') return { type: T.DAILY, hour: trigger.hour, minute: trigger.minute, channelId, delivery };
  if (trigger.type === 'weekly') return { type: T.WEEKLY, weekday: trigger.weekday, hour: trigger.hour, minute: trigger.minute, channelId, delivery };
  return { type: T.DATE, date: trigger.at, channelId, delivery };
}

function content(alarm: WakeAlarm, userName: string): Notifications.NotificationContentInput {
  const file = soundFor(alarm.sound);
  return {
    title: alarm.label || 'Despertador',
    body: `Buenos días${userName ? `, ${userName}` : ''}. Toca para ver tus hábitos de hoy.`,
    data: { url: '/morning', kind: 'wake', alarmId: alarm.id, snoozeMinutes: alarm.snoozeMinutes },
    sound: file ?? 'default',
    categoryIdentifier: WAKE_CATEGORY,
    sticky: true,
    autoDismiss: false,
    priority: Notifications.AndroidNotificationPriority.MAX,
    interruptionLevel: 'timeSensitive',
  };
}

/** Cancela los avisos anteriores de la alarma y programa los nuevos (modo app). */
export async function scheduleWakeAlarm(alarm: WakeAlarm, userName: string): Promise<string[]> {
  await cancelNotifications(alarm.notificationIds);
  const plan = planWakeAlarm(alarm);
  if (!notificationsSupported || plan.length === 0) return [];
  if (!(await ensurePermission())) return [];
  const ids: string[] = [];
  for (const trigger of plan) {
    ids.push(await Notifications.scheduleNotificationAsync({ content: content(alarm, userName), trigger: toTrigger(trigger, alarm) }));
  }
  return ids;
}

/** Repite la alarma dentro de `snoozeMinutes`. */
export async function snoozeWakeAlarm(alarm: WakeAlarm, userName: string): Promise<string | null> {
  if (!notificationsSupported) return null;
  return Notifications.scheduleNotificationAsync({
    content: { ...content(alarm, userName), title: `${alarm.label || 'Despertador'} (pospuesta)` },
    trigger: toTrigger(snoozeTrigger(alarm.snoozeMinutes, new Date()), alarm),
  });
}

/** Prueba: suena en 5 segundos con el sonido elegido. */
export async function testWakeAlarm(alarm: WakeAlarm, userName: string): Promise<boolean> {
  if (!notificationsSupported || !(await ensurePermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { ...content(alarm, userName), title: `${alarm.label || 'Despertador'} (prueba)` },
    trigger: toTrigger({ type: 'date', at: new Date(Date.now() + 5000) }, alarm),
  });
  return true;
}
