import { fromKey, shiftKey, timeToMinutes, toKey } from './dates.ts';
import { isPaused, isScheduledOn } from './habits.ts';
import type { Habit, TimeOfDay } from './types.ts';

/*
 * Planificación pura de recordatorios: decide QUÉ avisos deben existir para un
 * hábito. El servicio de notificaciones solo aplica el plan (cancelar y
 * programar), lo que permite probar la lógica sin el sistema operativo.
 */

export type ReminderTrigger =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number } // 1 = domingo … 7 = sábado
  | { type: 'date'; at: Date };

export interface PlannedReminder {
  /** Hora del recordatorio al que pertenece (agrupa los avisos por alarma). */
  time: TimeOfDay;
  trigger: ReminderTrigger;
}

/** Días por delante que se programan cuando no basta con un aviso repetitivo. */
export const ROLLING_DAYS = 14;
/** iOS admite como máximo 64 notificaciones pendientes por app; se reserva margen. */
export const MAX_PER_HABIT = 24;

function split(time: TimeOfDay) {
  const m = timeToMinutes(time);
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

/**
 * - Sin recordatorios, archivado, eliminado, en pausa o notificaciones apagadas → nada.
 * - Diario o días concretos sin fecha de fin → avisos repetitivos.
 * - Intervalos o con fecha de fin → avisos por fecha en los próximos 14 días,
 *   que se renuevan cada vez que se abre la app.
 */
export function planHabitReminders(habit: Habit, now: Date, enabledGlobally = true): PlannedReminder[] {
  if (!enabledGlobally || habit.reminderTimes.length === 0 || habit.archived || habit.deletedAt || isPaused(habit)) return [];
  const times = [...new Set(habit.reminderTimes)].sort();

  const repeating = !habit.endDate && (habit.frequency === 'daily' || habit.frequency === 'weekly');
  if (repeating) {
    const out: PlannedReminder[] = [];
    for (const time of times) {
      const { hour, minute } = split(time);
      if (habit.frequency === 'daily' || habit.daysOfWeek.length === 7) out.push({ time, trigger: { type: 'daily', hour, minute } });
      else for (const d of [...habit.daysOfWeek].sort()) out.push({ time, trigger: { type: 'weekly', weekday: d + 1, hour, minute } });
    }
    return out;
  }

  const out: PlannedReminder[] = [];
  const today = toKey(now);
  for (let i = 0; i < ROLLING_DAYS && out.length < MAX_PER_HABIT; i++) {
    const date = shiftKey(today, i);
    if (!isScheduledOn(habit, date)) continue;
    for (const time of times) {
      const { hour, minute } = split(time);
      const at = fromKey(date);
      at.setHours(hour, minute, 0, 0);
      if (at.getTime() <= now.getTime()) continue;
      out.push({ time, trigger: { type: 'date', at } });
      if (out.length >= MAX_PER_HABIT) break;
    }
  }
  return out;
}
