import { subDays } from 'date-fns';
import { fromKey, shiftKey, timeToMinutes } from './dates.ts';
import type { DateKey, SleepLog, TimeOfDay } from './types.ts';

/**
 * Calcula el intervalo de sueño a partir de la hora de acostarse y la de
 * despertar. Si la hora de acostarse es igual o posterior a la de despertar
 * (p. ej. 23:30 → 07:00) se asume que fue la noche anterior.
 */
export function computeSleepWindow(wakeDate: DateKey, bedtime: TimeOfDay, wakeTime: TimeOfDay) {
  const bedMin = timeToMinutes(bedtime);
  const wakeMin = timeToMinutes(wakeTime);
  const wake = fromKey(wakeDate);
  wake.setHours(Math.floor(wakeMin / 60), wakeMin % 60, 0, 0);

  const bed = bedMin >= wakeMin ? subDays(fromKey(wakeDate), 1) : fromKey(wakeDate);
  bed.setHours(Math.floor(bedMin / 60), bedMin % 60, 0, 0);

  const durationMinutes = Math.round((wake.getTime() - bed.getTime()) / 60000);
  return { bedtimeAt: bed.toISOString(), wakeAt: wake.toISOString(), durationMinutes };
}

/**
 * Hora de acostarse en minutos relativos a medianoche (-720…720), para poder
 * promediar 23:30 y 00:30 sin obtener 12:00.
 */
export function bedtimeOffset(iso: string): number {
  const d = new Date(iso);
  const m = d.getHours() * 60 + d.getMinutes();
  return m > 720 ? m - 1440 : m;
}

export interface SleepSummary {
  nights: number;
  avgMinutes: number;
  avgBedtimeOffset: number | null;
  avgWakeMinutes: number | null;
  avgQuality: number;
  goalHitRate: number;
  /** Desviación estándar de la hora de acostarse (min). Menor = más constante. */
  bedtimeSpread: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function summarizeSleep(logs: SleepLog[], goalMinutes: number): SleepSummary {
  const n = logs.length;
  if (n === 0) {
    return { nights: 0, avgMinutes: 0, avgBedtimeOffset: null, avgWakeMinutes: null, avgQuality: 0, goalHitRate: 0, bedtimeSpread: 0 };
  }
  const offsets = logs.map((l) => bedtimeOffset(l.bedtimeAt));
  const wakes = logs.map((l) => {
    const d = new Date(l.wakeAt);
    return d.getHours() * 60 + d.getMinutes();
  });
  const avgOffset = sum(offsets) / n;
  const variance = sum(offsets.map((o) => (o - avgOffset) ** 2)) / n;
  return {
    nights: n,
    avgMinutes: sum(logs.map((l) => l.durationMinutes)) / n,
    avgBedtimeOffset: avgOffset,
    avgWakeMinutes: sum(wakes) / n,
    avgQuality: sum(logs.map((l) => l.quality)) / n,
    goalHitRate: logs.filter((l) => l.durationMinutes >= goalMinutes).length / n,
    bedtimeSpread: Math.sqrt(variance),
  };
}

export function logsInRange(logs: SleepLog[], from: DateKey, to: DateKey): SleepLog[] {
  return logs.filter((l) => !l.deletedAt && l.date >= from && l.date <= to);
}

/** Últimos `days` días que terminan en `end`, con el registro de cada día o null. */
export function sleepSeries(logs: SleepLog[], end: DateKey, days: number): { date: DateKey; log: SleepLog | null }[] {
  const byDate = new Map(logs.filter((l) => !l.deletedAt).map((l) => [l.date, l]));
  const out: { date: DateKey; log: SleepLog | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftKey(end, -i);
    out.push({ date, log: byDate.get(date) ?? null });
  }
  return out;
}

export const QUALITY_LABELS = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'] as const;
