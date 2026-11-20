import { formatNumber } from './habits.ts';
import { shiftKey } from './dates.ts';
import type { DateKey, Habit, LogIndex, WaterLog, WaterUnit } from './types.ts';

/** Total de ml por día. */
export function waterTotals(logs: WaterLog[]): Record<DateKey, number> {
  const out: Record<DateKey, number> = {};
  for (const l of logs) {
    if (l.deletedAt) continue;
    out[l.date] = (out[l.date] ?? 0) + l.amountMl;
  }
  return out;
}

/**
 * Un hábito de hidratación medido en L o ml se alimenta del módulo de agua:
 * registrar agua avanza el hábito y viceversa, sin duplicar datos.
 */
export function isWaterHabit(habit: Pick<Habit, 'category' | 'trackingType' | 'unit'>): boolean {
  return habit.category === 'hydration' && habit.trackingType === 'quantity' && (habit.unit === 'L' || habit.unit === 'ml');
}

export function mlToUnit(ml: number, unit: string | null): number {
  return unit === 'L' ? ml / 1000 : ml;
}

export function unitToMl(value: number, unit: string | null): number {
  return Math.round(unit === 'L' ? value * 1000 : value);
}

/** Sustituye el progreso de los hábitos de agua por los totales del módulo de hidratación. */
export function mergeWaterIntoIndex(logs: LogIndex, habits: Habit[], totals: Record<DateKey, number>): LogIndex {
  const waterHabits = habits.filter(isWaterHabit);
  if (waterHabits.length === 0) return logs;
  const out: LogIndex = { ...logs };
  const dates = new Set([...Object.keys(totals), ...Object.keys(logs)]);
  for (const date of dates) {
    const day = { ...(out[date] ?? {}) };
    for (const h of waterHabits) {
      const ml = totals[date] ?? 0;
      if (ml > 0) day[h.id] = mlToUnit(ml, h.unit);
      else delete day[h.id];
    }
    out[date] = day;
  }
  return out;
}

export function formatWater(ml: number, unit: WaterUnit): string {
  return unit === 'L' ? `${formatNumber(ml / 1000)} L` : `${Math.round(ml)} ml`;
}

/** Totales de los últimos `days` días terminando en `end`. */
export function waterSeries(totals: Record<DateKey, number>, end: DateKey, days: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = shiftKey(end, -(days - 1 - i));
    return { date, ml: totals[date] ?? 0 };
  });
}

/** Horas de recordatorio de agua entre `start` y `end` cada `everyMinutes`. */
export function waterReminderSlots(startMin: number, endMin: number, everyMinutes: number): number[] {
  const out: number[] = [];
  if (everyMinutes < 15 || endMin < startMin) return out;
  for (let m = startMin; m <= endMin; m += everyMinutes) out.push(m);
  return out;
}

export const WATER_QUICK_ML = [150, 250, 500];
