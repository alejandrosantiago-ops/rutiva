import { startOfWeek } from 'date-fns';
import { bestStreak, currentStreak, dayProgress, getValue, habitStats, isActive, isScheduledOn } from './habits.ts';
import { fromKey, rangeKeys, shiftKey, toKey, weekdayOf } from './dates.ts';
import type { DateKey, Habit, HabitCategory, LogIndex } from './types.ts';

/*
 * Todas las métricas salen de los registros reales. Un día solo cuenta para un
 * hábito si le tocaba (desde su fecha de inicio, sin pausas y según la
 * programación vigente ese día). Hoy sin terminar no penaliza.
 */

export interface DailyPoint {
  date: DateKey;
  ratio: number;
  scheduled: number;
  completed: number;
}

const live = (habits: Habit[]) => habits.filter((h) => !h.deletedAt);

export function dailySeries(habits: Habit[], logs: LogIndex, end: DateKey, days: number): DailyPoint[] {
  const hs = live(habits);
  return rangeKeys(shiftKey(end, -(days - 1)), end).map((date) => ({ date, ...dayProgress(hs, logs, date) }));
}

/** ¿Cuenta este día para las métricas? Debe tener hábitos y no ser "hoy a medias". */
function counts(p: DailyPoint, today: DateKey) {
  return p.scheduled > 0 && !(p.date === today && p.completed < p.scheduled);
}

export interface Compliance {
  /** Hábitos-día cumplidos / programados (0…1). */
  rate: number;
  scheduled: number;
  completed: number;
}

export function compliance(habits: Habit[], logs: LogIndex, from: DateKey, to: DateKey, today: DateKey): Compliance {
  if (from > to) return { rate: 0, scheduled: 0, completed: 0 };
  let scheduled = 0;
  let completed = 0;
  const hs = live(habits);
  for (const date of rangeKeys(from, to)) {
    const p = { date, ...dayProgress(hs, logs, date) };
    if (!counts(p, today)) continue;
    scheduled += p.scheduled;
    completed += p.completed;
  }
  return { rate: scheduled ? completed / scheduled : 0, scheduled, completed };
}

export interface Overview {
  completionRate: number;
  perfectDays: number;
  totalCompletions: number;
  activeDays: number;
  bestCurrentStreak: number;
  bestEverStreak: number;
}

export function overview(habits: Habit[], logs: LogIndex, end: DateKey, days: number, today: DateKey): Overview {
  const series = dailySeries(habits, logs, end, days);
  const counted = series.filter((p) => counts(p, today));
  const scheduled = counted.reduce((a, p) => a + p.scheduled, 0);
  const completed = counted.reduce((a, p) => a + p.completed, 0);
  const active = habits.filter(isActive);
  return {
    completionRate: scheduled ? completed / scheduled : 0,
    perfectDays: counted.filter((p) => p.completed === p.scheduled).length,
    totalCompletions: series.reduce((a, p) => a + p.completed, 0),
    activeDays: series.filter((p) => p.completed > 0).length,
    bestCurrentStreak: Math.max(0, ...active.map((h) => currentStreak(h, logs, today))),
    bestEverStreak: Math.max(0, ...active.map((h) => bestStreak(h, logs, today))),
  };
}

/** Cumplimiento por semana; `null` si esa semana no tenía nada programado. */
export function weeklySeries(
  habits: Habit[],
  logs: LogIndex,
  today: DateKey,
  weeks: number,
  weekStartsOn: 0 | 1,
): { start: DateKey; rate: number | null }[] {
  const thisWeek = toKey(startOfWeek(fromKey(today), { weekStartsOn }));
  return Array.from({ length: weeks }, (_, i) => {
    const start = shiftKey(thisWeek, -7 * (weeks - 1 - i));
    const end = shiftKey(start, 6) > today ? today : shiftKey(start, 6);
    const c = compliance(habits, logs, start, end, today);
    return { start, rate: c.scheduled ? c.rate : null };
  });
}

/** Cumplimiento medio por día de la semana (índice Date#getDay). */
export function weekdayPerformance(habits: Habit[], logs: LogIndex, end: DateKey, days: number, today: DateKey): number[] {
  const totals = Array.from({ length: 7 }, () => ({ s: 0, c: 0 }));
  for (const p of dailySeries(habits, logs, end, days)) {
    if (!counts(p, today)) continue;
    const w = weekdayOf(p.date);
    totals[w].s += p.scheduled;
    totals[w].c += p.completed;
  }
  return totals.map((t) => (t.s ? t.c / t.s : 0));
}

export interface HabitRanking {
  habit: Habit;
  rate: number;
  scheduledDays: number;
  streak: number;
}

/** Hábitos actuales ordenados por cumplimiento. Excluye los que no tuvieron días programados. */
export function habitRanking(habits: Habit[], logs: LogIndex, end: DateKey, days: number, today: DateKey): HabitRanking[] {
  const from = shiftKey(end, -(days - 1));
  return habits
    .filter(isActive)
    .map((habit) => {
      const s = habitStats(habit, logs, from, end, today);
      return { habit, rate: s.rate, scheduledDays: s.scheduledDays, streak: currentStreak(habit, logs, today) };
    })
    .filter((r) => r.scheduledDays > 0)
    .sort((a, b) => b.rate - a.rate || b.streak - a.streak);
}

/** Minutos registrados en hábitos por duración de una categoría (incluye archivados). */
export function minutesByCategory(habits: Habit[], logs: LogIndex, category: HabitCategory, from: DateKey, to: DateKey) {
  const hs = live(habits).filter((h) => h.category === category && h.trackingType === 'duration');
  let minutes = 0;
  const perDay: { date: DateKey; minutes: number }[] = [];
  for (const date of rangeKeys(from, to)) {
    const m = hs.reduce((a, h) => a + getValue(logs, h.id, date), 0);
    minutes += m;
    perDay.push({ date, minutes: m });
  }
  return { minutes, perDay, habitCount: hs.length };
}

/** Cuadrícula de actividad (columnas = semanas, filas = días). `null` = nada programado o futuro. */
export function activityGrid(habits: Habit[], logs: LogIndex, today: DateKey, weeks: number, weekStartsOn: 0 | 1) {
  const firstWeek = shiftKey(toKey(startOfWeek(fromKey(today), { weekStartsOn })), -7 * (weeks - 1));
  const hs = live(habits);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = shiftKey(firstWeek, w * 7 + d);
      if (date > today) return { date, ratio: null };
      const p = dayProgress(hs, logs, date);
      return { date, ratio: p.scheduled ? p.ratio : null };
    }),
  );
}

/** ¿Algún hábito (incluidos archivados) estaba programado ese día? */
export function anyScheduled(habits: Habit[], date: DateKey) {
  return live(habits).some((h) => isScheduledOn(h, date));
}
