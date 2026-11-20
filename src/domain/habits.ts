import { daysBetween, rangeKeys, shiftKey, weekdayOf } from './dates.ts';
import type { DateKey, Habit, LogIndex, Weekday } from './types.ts';

export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function getCount(logs: LogIndex, habitId: string, date: DateKey): number {
  return logs[date]?.[habitId] ?? 0;
}

/** ¿Le toca al hábito ese día? (según días de la semana y fecha de inicio). */
export function isScheduledOn(habit: Habit, date: DateKey): boolean {
  if (date < habit.startDate) return false;
  return habit.daysOfWeek.includes(weekdayOf(date) as Weekday);
}

export function isDoneOn(habit: Habit, logs: LogIndex, date: DateKey): boolean {
  return getCount(logs, habit.id, date) >= habit.targetPerDay;
}

export function isActive(habit: Habit): boolean {
  return !habit.archived && !habit.deletedAt;
}

export function habitsForDay(habits: Habit[], date: DateKey): Habit[] {
  return habits.filter((h) => isActive(h) && isScheduledOn(h, date));
}

export interface DayProgress {
  scheduled: number;
  completed: number;
  /** 0…1. Los hábitos con meta mayor que 1 aportan progreso parcial. */
  ratio: number;
}

export function dayProgress(habits: Habit[], logs: LogIndex, date: DateKey): DayProgress {
  const due = habitsForDay(habits, date);
  if (due.length === 0) return { scheduled: 0, completed: 0, ratio: 0 };
  let completed = 0;
  let partial = 0;
  for (const h of due) {
    const c = getCount(logs, h.id, date);
    if (c >= h.targetPerDay) completed++;
    partial += Math.min(1, c / h.targetPerDay);
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

export interface HabitStats {
  scheduledDays: number;
  completedDays: number;
  rate: number; // 0…1
  totalCount: number;
}

/** Estadísticas entre `from` y `to` (inclusive). Hoy pendiente no penaliza. */
export function habitStats(habit: Habit, logs: LogIndex, from: DateKey, to: DateKey, today: DateKey): HabitStats {
  let scheduledDays = 0;
  let completedDays = 0;
  let totalCount = 0;
  if (from > to) return { scheduledDays, completedDays, rate: 0, totalCount };
  for (const day of rangeKeys(from, to)) {
    totalCount += getCount(logs, habit.id, day);
    if (!isScheduledOn(habit, day)) continue;
    const done = isDoneOn(habit, logs, day);
    if (day === today && !done) continue;
    scheduledDays++;
    if (done) completedDays++;
  }
  return { scheduledDays, completedDays, rate: scheduledDays ? completedDays / scheduledDays : 0, totalCount };
}

const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function describeFrequency(habit: Pick<Habit, 'frequency' | 'daysOfWeek'>): string {
  if (habit.frequency === 'daily' || habit.daysOfWeek.length === 7) return 'Todos los días';
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => habit.daysOfWeek.includes(d as Weekday));
  if (days.length === 5 && !days.includes(0) && !days.includes(6)) return 'Entre semana';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Fines de semana';
  return days.map((d) => DAY_ABBR[d]).join(' · ');
}

export function daysSince(from: DateKey, to: DateKey): number {
  return Math.max(0, daysBetween(from, to));
}
