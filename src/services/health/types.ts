import type { SleepSource } from '@/domain/types';

/**
 * Contrato para importar sueño desde la plataforma de salud del dispositivo.
 *
 * Reglas:
 * - Nunca se lee nada sin que la persona lo pida y conceda el permiso del sistema.
 * - Solo se solicita lectura de sesiones de sueño (nada de escritura ni otros datos).
 * - Los registros importados conservan `externalId` para no duplicarse.
 */
export interface ExternalSleepSession {
  externalId: string;
  start: string; // ISO
  end: string; // ISO
  /** Minutos despierto dentro de la sesión, si la plataforma lo informa. */
  awakeMinutes?: number;
}

export type HealthAvailability =
  | { available: true }
  | { available: false; reason: 'unsupported-platform' | 'not-installed' | 'needs-dev-build' };

export interface HealthProvider {
  readonly source: Extract<SleepSource, 'health_connect' | 'healthkit'>;
  readonly name: string;
  availability(): Promise<HealthAvailability>;
  /** Abre el diálogo de permisos del sistema. Devuelve si se concedió la lectura de sueño. */
  requestSleepPermission(): Promise<boolean>;
  readSleepSessions(from: Date, to: Date): Promise<ExternalSleepSession[]>;
}
