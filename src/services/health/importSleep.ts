import { sleepDateOf } from '@/domain/sleep';
import type { SleepInput } from '@/domain/types';
import { useSleepStore } from '@/stores/useSleepStore';
import type { HealthProvider } from './types';

/**
 * Importa sesiones de sueño tras pedir permiso explícito. Ignora las ya
 * importadas (mismo externalId) y no sobrescribe noches registradas a mano.
 */
export async function importSleep(provider: HealthProvider, days = 30): Promise<{ imported: number; skipped: number }> {
  const availability = await provider.availability();
  if (!availability.available) throw new Error(`${provider.name} no está disponible en este dispositivo.`);
  if (!(await provider.requestSleepPermission())) throw new Error('No se concedió el permiso de lectura de sueño.');

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const sessions = await provider.readSleepSessions(from, to);
  const { logs, save } = useSleepStore.getState();
  const known = new Set(logs.map((l) => l.externalId).filter(Boolean));
  const manualDates = new Set(logs.filter((l) => l.source === 'manual').map((l) => l.date));

  let imported = 0;
  let skipped = 0;
  for (const s of sessions) {
    const date = sleepDateOf(s.end);
    if (known.has(s.externalId) || manualDates.has(date)) {
      skipped++;
      continue;
    }
    const input: SleepInput = {
      date,
      bedtimeAt: s.start,
      wakeAt: s.end,
      latencyMinutes: s.awakeMinutes ?? 0,
      quality: 3,
      notes: null,
      source: provider.source,
      externalId: s.externalId,
    };
    await save(input);
    imported++;
  }
  return { imported, skipped };
}
