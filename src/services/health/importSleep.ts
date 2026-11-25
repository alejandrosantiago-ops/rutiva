import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { planSleepImport } from './plan';
import type { HealthProvider } from './types';

export { planSleepImport };

/** Importa sesiones de sueño tras pedir permiso explícito. */
export async function importSleep(provider: HealthProvider, days = 30): Promise<{ imported: number; skipped: number }> {
  const availability = await provider.availability();
  if (!availability.available) throw new Error(`${provider.name} no está disponible en este dispositivo.`);
  if (!(await provider.requestSleepPermission())) throw new Error('No se concedió el permiso de lectura de sueño.');

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const sessions = await provider.readSleepSessions(from, to);
  const { logs, save } = useSleepStore.getState();
  const { inputs, skipped } = planSleepImport(sessions, logs, provider.source);
  for (const input of inputs) await save(input);
  return { imported: inputs.length, skipped };
}
