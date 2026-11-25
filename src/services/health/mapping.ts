import type { ExternalSleepSession } from './types';

/** Fases de Health Connect que cuentan como "despierto" dentro de una sesión. */
const AWAKE_STAGES = new Set([1 /* AWAKE */, 3 /* OUT_OF_BED */, 7 /* AWAKE_IN_BED */]);

export interface HealthConnectSleepRecord {
  startTime: string;
  endTime: string;
  metadata?: { id?: string };
  stages?: { startTime: string; endTime: string; stage: number }[];
}

const minutes = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);

/**
 * Convierte una sesión de Health Connect al formato común. El tiempo despierto
 * (según las fases registradas por el reloj o la app de origen) se descuenta
 * como latencia, para que la duración refleje el sueño real.
 */
export function fromHealthConnect(record: HealthConnectSleepRecord): ExternalSleepSession | null {
  const total = minutes(record.startTime, record.endTime);
  if (!record.metadata?.id || total < 1 || total > 24 * 60) return null;
  const awake = (record.stages ?? []).filter((s) => AWAKE_STAGES.has(s.stage)).reduce((a, s) => a + minutes(s.startTime, s.endTime), 0);
  return {
    externalId: `hc:${record.metadata.id}`,
    start: new Date(record.startTime).toISOString(),
    end: new Date(record.endTime).toISOString(),
    awakeMinutes: Math.min(Math.round(awake), Math.round(total) - 1),
  };
}
