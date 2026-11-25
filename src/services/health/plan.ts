import { sleepDateOf } from '@/domain/sleep';
import type { SleepInput, SleepLog, SleepSource } from '@/domain/types';
import type { ExternalSleepSession } from './types';

/**
 * Decide qué sesiones externas se importan:
 * - se ignoran las ya importadas (mismo externalId);
 * - nunca se sustituye una noche registrada a mano o con el temporizador;
 * - si hay varias sesiones el mismo día (siestas), se queda la más larga.
 */
export function planSleepImport(sessions: ExternalSleepSession[], existing: SleepLog[], source: SleepSource) {
  const known = new Set(existing.map((l) => l.externalId).filter(Boolean));
  const protectedDates = new Set(existing.filter((l) => l.source === 'manual' || l.source === 'timer').map((l) => l.date));
  const best = new Map<string, ExternalSleepSession>();
  let skipped = 0;
  for (const s of sessions) {
    const date = sleepDateOf(s.end);
    if (known.has(s.externalId) || protectedDates.has(date)) {
      skipped++;
      continue;
    }
    const prev = best.get(date);
    const len = (x: ExternalSleepSession) => new Date(x.end).getTime() - new Date(x.start).getTime();
    if (!prev || len(s) > len(prev)) {
      if (prev) skipped++;
      best.set(date, s);
    } else {
      skipped++;
    }
  }
  const inputs: SleepInput[] = [...best.entries()].map(([date, s]) => ({
    date,
    bedtimeAt: s.start,
    wakeAt: s.end,
    latencyMinutes: s.awakeMinutes ?? 0,
    quality: 3,
    notes: null,
    source,
    externalId: s.externalId,
  }));
  return { inputs, skipped };
}
