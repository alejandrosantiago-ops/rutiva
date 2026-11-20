import { bestStreak, currentStreak, dayProgress, habitStats, isActive } from './habits.ts';
import { rangeKeys, shiftKey, weekdayOf } from './dates.ts';
import type { DateKey, Habit, LogIndex } from './types.ts';

export interface DailyPoint {
  date: DateKey;
  ratio: number;
  scheduled: number;
  completed: number;
}

export function dailySeries(habits: Habit[], logs: LogIndex, end: DateKey, days: number): DailyPoint[] {
  return rangeKeys(shiftKey(end, -(days - 1)), end).map((date) => ({ date, ...dayProgress(habits, logs, date) }));
}

/** Un día cuenta para las métricas si tenía hábitos y no es "hoy sin terminar". */
function counts(p: DailyPoint, today: DateKey) {
  return p.scheduled > 0 && !(p.date === today && p.completed < p.scheduled);
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
  const active = habits.filter(isActive);
  const series = dailySeries(active, logs, end, days);
  const counted = series.filter((p) => counts(p, today));
  const scheduled = counted.reduce((a, p) => a + p.scheduled, 0);
  const completed = counted.reduce((a, p) => a + p.completed, 0);
  return {
    completionRate: scheduled ? completed / scheduled : 0,
    perfectDays: counted.filter((p) => p.completed === p.scheduled).length,
    totalCompletions: series.reduce((a, p) => a + p.completed, 0),
    activeDays: series.filter((p) => p.completed > 0).length,
    bestCurrentStreak: Math.max(0, ...active.map((h) => currentStreak(h, logs, today))),
    bestEverStreak: Math.max(0, ...active.map((h) => bestStreak(h, logs, today))),
  };
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
  streak: number;
}

export function habitRanking(habits: Habit[], logs: LogIndex, end: DateKey, days: number, today: DateKey): HabitRanking[] {
  const from = shiftKey(end, -(days - 1));
  return habits
    .filter(isActive)
    .map((habit) => ({
      habit,
      rate: habitStats(habit, logs, from, end, today).rate,
      streak: currentStreak(habit, logs, today),
    }))
    .sort((a, b) => b.rate - a.rate);
}
