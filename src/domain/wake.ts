import { timeToMinutes } from './dates.ts';
import type { ReminderTrigger } from './reminders.ts';
import type { WakeAlarm, WakeSound, Weekday } from './types.ts';

/*
 * Despertador: lógica pura (qué avisos programar, cuándo suena la próxima vez
 * y cómo se pospone). El servicio de notificaciones o el módulo nativo solo
 * aplican lo que se decide aquí.
 */

export const WAKE_SOUNDS: Record<WakeSound, { label: string; file: string | null }> = {
  classic: { label: 'Clásica', file: 'alarm_classic.wav' },
  soft: { label: 'Suave', file: 'alarm_soft.wav' },
  digital: { label: 'Digital', file: 'alarm_digital.wav' },
  default: { label: 'Del sistema', file: null },
};

function split(time: string) {
  const m = timeToMinutes(time);
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

/** Disparadores para el modo "Rutiva": diario si son los 7 días, si no uno por día. */
export function planWakeAlarm(alarm: Pick<WakeAlarm, 'time' | 'daysOfWeek' | 'enabled' | 'mode'>): ReminderTrigger[] {
  if (!alarm.enabled || alarm.mode !== 'app' || alarm.daysOfWeek.length === 0) return [];
  const { hour, minute } = split(alarm.time);
  if (alarm.daysOfWeek.length === 7) return [{ type: 'daily', hour, minute }];
  // WEEKLY usa 1 = domingo … 7 = sábado.
  return [...alarm.daysOfWeek].sort().map((d) => ({ type: 'weekly', weekday: d + 1, hour, minute }));
}

/** Próximo instante en que sonará (hora local), o null si está desactivada. */
export function nextWakeAt(alarm: Pick<WakeAlarm, 'time' | 'daysOfWeek' | 'enabled'>, now: Date): Date | null {
  if (!alarm.enabled || alarm.daysOfWeek.length === 0) return null;
  const { hour, minute } = split(alarm.time);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (d.getTime() > now.getTime() && alarm.daysOfWeek.includes(d.getDay() as Weekday)) return d;
  }
  return null;
}

/** "Sonará en 7 h 20 min". */
export function describeUntil(at: Date, now: Date): string {
  const total = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `en ${d} ${d === 1 ? 'día' : 'días'}${h ? ` y ${h} h` : ''}`;
  if (h > 0) return `en ${h} h${m ? ` ${m} min` : ''}`;
  return m <= 1 ? 'en menos de un minuto' : `en ${m} min`;
}

/** Disparador de una repetición pospuesta. */
export function snoozeTrigger(minutes: number, now: Date): ReminderTrigger {
  return { type: 'date', at: new Date(now.getTime() + Math.max(1, minutes) * 60000) };
}

const DAY_ABBR = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function describeWakeDays(days: Weekday[]): string {
  if (days.length === 7) return 'Todos los días';
  const sorted = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d as Weekday));
  if (sorted.length === 5 && !days.includes(0) && !days.includes(6)) return 'De lunes a viernes';
  if (sorted.length === 2 && days.includes(0) && days.includes(6)) return 'Fines de semana';
  return sorted.map((d) => DAY_ABBR[d]).join(' · ');
}
