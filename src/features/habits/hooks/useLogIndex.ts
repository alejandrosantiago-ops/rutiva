import { useMemo } from 'react';
import { mergeWaterIntoIndex, waterTotals } from '@/domain/water';
import type { DateKey, LogIndex } from '@/domain/types';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useWaterStore } from '@/features/water/store/useWaterStore';

/** Totales de agua (ml) por día. */
export function useWaterTotals(): Record<DateKey, number> {
  const logs = useWaterStore((s) => s.logs);
  return useMemo(() => waterTotals(logs), [logs]);
}

/** Progreso efectivo de todos los hábitos (incluye el agua del módulo de hidratación). */
export function useLogIndex(): LogIndex {
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const totals = useWaterTotals();
  return useMemo(() => mergeWaterIntoIndex(logs, habits, totals), [logs, habits, totals]);
}
