import { daysBetween, rangeKeys, shiftKey, timeToMinutes, weekdayOf } from './dates.ts';
import type { DateKey, Habit, HabitFrequency, LogIndex, TrackingType, Weekday } from './types.ts';

export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
/** Margen para comparar decimales (0.1 + 0.2 ≠ 0.3). */
const EPS = 1e-6;

export function getValue(logs: LogIndex, habitId: string, date: DateKey): number {
  return logs[date]?.[habitId] ?? 0;
}

export function isActive(habit: Habit): boolean {
  return !habit.archived && !habit.deletedAt;
}

export function isPaused(habit: Habit): boolean {
  const last = habit.pauses[habit.pauses.length - 1];
  return !!last && last.to === null;
}

export function isPausedOn(habit: Habit, date: DateKey): boolean {
  return habit.pauses.some((p) => date >= p.from && (p.to === null || date <= p.to));
}

/** ¿Le toca al hábito ese día? Considera frecuencia, inicio, fin y pausas. */
export function isScheduledOn(habit: Habit, date: DateKey): boolean {
  if (date < habit.startDate) return false;
  if (habit.endDate && date > habit.endDate) return false;
  if (isPausedOn(habit, date)) return false;
  switch (habit.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return habit.daysOfWeek.includes(weekdayOf(date) as Weekday);
    case 'interval':
      return daysBetween(habit.startDate, date) % Math.max(1, habit.intervalDays) === 0;
  }
}

export function isDoneOn(habit: Habit, logs: LogIndex, date: DateKey): boolean {
  return getValue(logs, habit.id, date) >= habit.target - EPS;
}

export function progressRatio(habit: Habit, value: number): number {
  return habit.target > 0 ? Math.min(1, value / habit.target) : 0;
}

export function habitsForDay(habits: Habit[], date: DateKey): Habit[] {
  return habits.filter((h) => isActive(h) && isScheduledOn(h, date));
}

export interface DayProgress {
  scheduled: number;
  completed: number;
  /** 0…1. Los hábitos de cantidad, duración o frecuencia aportan progreso parcial. */
  ratio: number;
}

export function dayProgress(habits: Habit[], logs: LogIndex, date: DateKey): DayProgress {
  const due = habitsForDay(habits, date);
  if (due.length === 0) return { scheduled: 0, completed: 0, ratio: 0 };
  let completed = 0;
  let partial = 0;
  for (const h of due) {
    const v = getValue(logs, h.id, date);
    if (v >= h.target - EPS) completed++;
    partial += progressRatio(h, v);
  }
  return { scheduled: due.length, completed, ratio: partial / due.length };
}

/**
 * Racha actual: días programados consecutivos cumplidos.
 * Si hoy aún no se ha cumplido no rompe la racha; se cuenta desde ayer.
 */
export function currentStreak(habit: Habit, logs: LogIndex, today: DateKey): number {
  let cursor = today;
  if (isScheduledOn(habit, cursor) && !isDoneOn(habit, logs, cursor)) cursor = shiftKey(cursor, -1);
  let streak = 0;
  while (cursor >= habit.startDate) {
    if (isScheduledOn(habit, cursor)) {
      if (!isDoneOn(habit, logs, cursor)) break;
      streak++;
    }
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

export function bestStreak(habit: Habit, logs: LogIndex, today: DateKey): number {
  if (habit.startDate > today) return 0;
  let best = 0;
  let run = 0;
  for (const day of rangeKeys(habit.startDate, today)) {
    if (!isScheduledOn(habit, day)) continue;
    if (isDoneOn(habit, logs, day)) {
      run++;
      if (run > best) best = run;
    } else if (day !== today) {
      run = 0;
    }
  }
  return best;
}

/**
 * Días seguidos en los que se cumplieron TODOS los hábitos programados.
 * Los días sin hábitos no rompen la racha; hoy sin terminar tampoco.
 */
export function perfectDayStreak(habits: Habit[], logs: LogIndex, today: DateKey): number {
  const active = habits.filter(isActive);
  if (active.length === 0) return 0;
  const earliest = active.reduce((m, h) => (h.startDate < m ? h.startDate : m), today);
  let streak = 0;
  for (let day = today; day >= earliest; day = shiftKey(day, -1)) {
    const p = dayProgress(active, logs, day);
    if (p.scheduled === 0) continue;
    if (p.completed === p.scheduled) streak++;
    else if (day !== today) break;
  }
  return streak;
}

export interface HabitStats {
  scheduledDays: number;
  completedDays: number;
  rate: number; // 0…1
  totalValue: number;
}

/** Estadísticas entre `from` y `to` (inclusive). Hoy pendiente no penaliza. */
export function habitStats(habit: Habit, logs: LogIndex, from: DateKey, to: DateKey, today: DateKey): HabitStats {
  let scheduledDays = 0;
  let completedDays = 0;
  let totalValue = 0;
  if (from > to) return { scheduledDays, completedDays, rate: 0, totalValue };
  for (const day of rangeKeys(from, to)) {
    totalValue += getValue(logs, habit.id, day);
    if (!isScheduledOn(habit, day)) continue;
    const done = isDoneOn(habit, logs, day);
    if (day === today && !done) continue;
    scheduledDays++;
    if (done) completedDays++;
  }
  return { scheduledDays, completedDays, rate: scheduledDays ? completedDays / scheduledDays : 0, totalValue };
}

/** Siguiente hábito pendiente de hoy, priorizando la hora sugerida más próxima. */
export function nextHabit(habits: Habit[], logs: LogIndex, today: DateKey, nowMinutes: number): Habit | null {
  const pending = habitsForDay(habits, today).filter((h) => !isDoneOn(h, logs, today));
  if (pending.length === 0) return null;
  const timeOf = (h: Habit) => {
    const t = h.suggestedTime ?? [...h.reminderTimes].sort()[0];
    return t ? timeToMinutes(t) : null;
  };
  const upcoming = pending
    .map((h) => ({ h, t: timeOf(h) }))
    .filter((x) => x.t !== null && x.t >= nowMinutes)
    .sort((a, b) => a.t! - b.t!);
  if (upcoming.length) return upcoming[0].h;
  const untimed = pending.find((h) => timeOf(h) === null);
  return untimed ?? pending[0];
}

// ---------- Texto ----------

/** Número con hasta 2 decimales, sin ceros sobrantes: 2.5, 1.25, 3. */
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function formatMinutes(total: number): string {
  const m = Math.round(total);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Unidad de un hábito de frecuencia: la suya (p. ej. "vasos") o "vez/veces". */
function countUnit(habit: Pick<Habit, 'unit'>, n: number): string {
  return habit.unit?.trim() || (n === 1 ? 'vez' : 'veces');
}

export function unitLabel(habit: Pick<Habit, 'trackingType' | 'unit' | 'target'>): string {
  switch (habit.trackingType) {
    case 'quantity':
      return habit.unit ?? '';
    case 'duration':
      return 'min';
    case 'count':
      return countUnit(habit, habit.target);
    default:
      return '';
  }
}

/** Meta legible: "2.5 L", "1 h", "2 veces al día". */
export function describeTarget(habit: Pick<Habit, 'trackingType' | 'unit' | 'target'>): string {
  switch (habit.trackingType) {
    case 'check':
      return 'Marcar como hecho';
    case 'quantity':
      return `${formatNumber(habit.target)} ${habit.unit ?? ''}`.trim();
    case 'duration':
      return formatMinutes(habit.target);
    case 'count':
      return `${habit.target} ${countUnit(habit, habit.target)} al día`;
  }
}

/** Progreso legible del día: "1.5 / 2.5 L", "45 / 60 min", "Pendiente". */
export function describeProgress(habit: Habit, value: number): string {
  const done = value >= habit.target - EPS;
  switch (habit.trackingType) {
    case 'check':
      return done ? 'Completado' : 'Pendiente';
    case 'quantity':
      return `${formatNumber(value)} / ${formatNumber(habit.target)} ${habit.unit ?? ''}`.trim();
    case 'duration':
      return `${Math.round(value)} / ${Math.round(habit.target)} min`;
    case 'count':
      return `${value} / ${habit.target} ${countUnit(habit, habit.target)}`;
  }
}

/** Lo que falta para la meta, o null si ya se cumplió. */
export function describeRemaining(habit: Habit, value: number): string | null {
  const left = habit.target - value;
  if (left <= EPS || habit.trackingType === 'check') return null;
  if (habit.trackingType === 'duration') return `faltan ${formatMinutes(left)}`;
  if (habit.trackingType === 'count') return `faltan ${left}${habit.unit ? ` ${habit.unit}` : ''}`;
  return `faltan ${formatNumber(left)} ${habit.unit ?? ''}`.trim();
}

const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function describeFrequency(habit: { frequency: HabitFrequency; daysOfWeek: Weekday[]; intervalDays: number }): string {
  if (habit.frequency === 'daily') return 'Todos los días';
  if (habit.frequency === 'interval') {
    return habit.intervalDays <= 1 ? 'Todos los días' : habit.intervalDays === 2 ? 'Cada 2 días' : `Cada ${habit.intervalDays} días`;
  }
  if (habit.daysOfWeek.length === 7) return 'Todos los días';
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => habit.daysOfWeek.includes(d as Weekday));
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Entre semana';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Fines de semana';
  return days.map((d) => DAY_ABBR[d]).join(' · ');
}

export const TRACKING_LABELS: Record<TrackingType, { label: string; hint: string }> = {
  check: { label: 'Simple', hint: 'Se completa marcando una casilla. Ej.: tomar vitaminas.' },
  quantity: { label: 'Cantidad', hint: 'Registra números con unidad. Ej.: 2.5 L de agua.' },
  duration: { label: 'Duración', hint: 'Meta de tiempo con cronómetro. Ej.: entrenar 60 min.' },
  count: { label: 'Frecuencia', hint: 'Veces al día. Ej.: caminar 2 veces.' },
};

export function daysSince(from: DateKey, to: DateKey): number {
  return Math.max(0, daysBetween(from, to));
}
