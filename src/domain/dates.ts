import { addDays, differenceInCalendarDays, format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';
import type { DateKey, TimeOfDay } from './types.ts';

export const KEY_FORMAT = 'yyyy-MM-dd';

export function toKey(date: Date): DateKey {
  return format(date, KEY_FORMAT);
}

export function fromKey(key: DateKey): Date {
  return parse(key, KEY_FORMAT, new Date());
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

export function shiftKey(key: DateKey, days: number): DateKey {
  return toKey(addDays(fromKey(key), days));
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return differenceInCalendarDays(fromKey(to), fromKey(from));
}

/** Lista inclusiva de fechas entre `from` y `to`. */
export function rangeKeys(from: DateKey, to: DateKey): DateKey[] {
  const total = daysBetween(from, to);
  const out: DateKey[] = [];
  for (let i = 0; i <= total; i++) out.push(shiftKey(from, i));
  return out;
}

export function weekdayOf(key: DateKey): number {
  return fromKey(key).getDay();
}

/** "HH:mm" → minutos desde medianoche. */
export function timeToMinutes(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): TimeOfDay {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function formatDurationShort(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Formato en español con la primera letra en mayúscula. */
export function formatEs(date: Date | DateKey, pattern: string): string {
  const d = typeof date === 'string' ? fromKey(date) : date;
  const text = format(d, pattern, { locale: es });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatIsoTime(iso: string): TimeOfDay {
  return format(parseISO(iso), 'HH:mm');
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Etiquetas cortas de días, indexadas por Date#getDay. */
export const WEEKDAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;
export const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

/** Días ordenados según el inicio de semana configurado. */
export function orderedWeekdays(weekStartsOn: 0 | 1): number[] {
  return weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
}
