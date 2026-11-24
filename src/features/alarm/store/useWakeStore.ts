import { create } from 'zustand';
import { repositories } from '@/data/repositories';
import { timeToMinutes } from '@/domain/dates';
import type { WakeAlarm, WakeAlarmInput } from '@/domain/types';
import { cancelNotifications } from '@/services/notifications';
import { scheduleWakeAlarm, snoozeWakeAlarm } from '@/services/notifications/wake';
import { systemAlarms } from '../../../../modules/rutiva-alarm';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';

interface WakeState {
  alarms: WakeAlarm[];
  loaded: boolean;
  load: () => Promise<void>;
  /**
   * Guarda la alarma. En modo "app" programa sus avisos; en modo "system"
   * crea (o vuelve a crear) la alarma en el Reloj de Android.
   * Devuelve si la alarma del sistema se pudo crear (o null si no aplica).
   */
  save: (input: WakeAlarmInput, id?: string) => Promise<{ alarm: WakeAlarm; systemCreated: boolean | null }>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<WakeAlarm | null>;
  snooze: (id: string) => Promise<void>;
  /** Reprograma todas (al arrancar o al cambiar el ajuste global). */
  rescheduleAll: () => Promise<void>;
}

const userName = () => useSettingsStore.getState().settings.userName.trim();
const notificationsOn = () => useSettingsStore.getState().settings.notificationsEnabled;

async function sync(alarm: WakeAlarm): Promise<WakeAlarm> {
  // Si las notificaciones están apagadas en Ajustes, el modo app no programa nada.
  const ids = notificationsOn() ? await scheduleWakeAlarm(alarm, userName()).catch(() => []) : [];
  if (!notificationsOn()) await cancelNotifications(alarm.notificationIds);
  return repositories.wakeAlarms.setNotifications(alarm.id, ids);
}

export const useWakeStore = create<WakeState>((set, get) => ({
  alarms: [],
  loaded: false,

  async load() {
    set({ alarms: await repositories.wakeAlarms.list(), loaded: true });
  },

  async save(input, id) {
    const before = id ? get().alarms.find((a) => a.id === id) : undefined;
    let alarm = await repositories.wakeAlarms.save(input, id);
    // Siempre se cancelan los avisos previos (por si pasó de "app" a "system").
    alarm = await sync({ ...alarm, notificationIds: before?.notificationIds ?? alarm.notificationIds });

    let systemCreated: boolean | null = null;
    if (alarm.mode === 'system' && alarm.enabled) {
      const m = timeToMinutes(alarm.time);
      systemCreated = await systemAlarms
        .create({ hour: Math.floor(m / 60), minute: m % 60, weekdays: alarm.daysOfWeek, label: alarm.label || 'Despertador' })
        .catch(() => false);
    }
    set((s) => ({ alarms: [...s.alarms.filter((a) => a.id !== alarm.id), alarm].sort((a, b) => (a.time < b.time ? -1 : 1)) }));
    return { alarm, systemCreated };
  },

  async setEnabled(id, enabled) {
    const alarm = get().alarms.find((a) => a.id === id);
    if (!alarm) return;
    const { id: _id, notificationIds: _ids, ...input } = alarm;
    await get().save({ ...input, enabled }, id);
  },

  async remove(id) {
    const alarm = get().alarms.find((a) => a.id === id) ?? null;
    if (alarm) await cancelNotifications(alarm.notificationIds);
    await repositories.wakeAlarms.remove(id);
    set((s) => ({ alarms: s.alarms.filter((a) => a.id !== id) }));
    return alarm;
  },

  async snooze(id) {
    const alarm = get().alarms.find((a) => a.id === id);
    if (alarm) await snoozeWakeAlarm(alarm, userName());
  },

  async rescheduleAll() {
    const updated = await Promise.all(get().alarms.map(sync));
    set({ alarms: updated });
  },
}));
