import type { AppSettings, Habit, HabitLog, SleepLog, WaterLog } from '@/domain/types';

/*
 * Sincronización entre dispositivos (opcional). La app sigue siendo
 * "offline-first": siempre escribe en SQLite y, cuando hay sesión y conexión,
 * intercambia cambios con el servidor.
 *
 * - Conflictos: gana la edición más reciente (updated_at de cada registro).
 * - Qué descargar: se usa un cursor del SERVIDOR (synced_at), no el reloj del
 *   teléfono, para no perder cambios si algún dispositivo va atrasado.
 * - Borrados: se propagan como "tombstones" (deleted_at), nunca se borra en duro.
 */

/** Ajustes que viajan entre dispositivos (el resto son de cada teléfono). */
export const SYNCED_SETTINGS = ['userName', 'sleepGoalMinutes', 'waterGoalMl', 'waterUnit', 'weekStartsOn'] as const;
export type SyncedSettings = Pick<AppSettings, (typeof SYNCED_SETTINGS)[number]>;

export interface SyncChanges {
  habits: Habit[];
  logs: HabitLog[];
  water: WaterLog[];
  sleep: SleepLog[];
  settings: { data: Partial<SyncedSettings>; updatedAt: string } | null;
}

export const emptyChanges = (): SyncChanges => ({ habits: [], logs: [], water: [], sleep: [], settings: null });

export function countChanges(c: SyncChanges): number {
  return c.habits.length + c.logs.length + c.water.length + c.sleep.length + (c.settings ? 1 : 0);
}

/** Datos locales (SQLite). */
export interface LocalSyncSource {
  /** Registros modificados después de `since` (incluidos los borrados). */
  changesSince(since: string | null): Promise<SyncChanges>;
  /** Aplica cambios remotos respetando "gana el más reciente". Devuelve cuántos se aplicaron. */
  apply(changes: SyncChanges): Promise<number>;
}

/** Servidor (Supabase u otro). */
export interface RemoteSyncTarget {
  /** Cambios recibidos por el servidor después del cursor, y el nuevo cursor. */
  pull(cursor: string | null): Promise<{ changes: SyncChanges; cursor: string | null }>;
  push(changes: SyncChanges): Promise<void>;
}

export interface SyncState {
  /** Cursor del servidor hasta el que ya se descargó. */
  remoteCursor: string | null;
  /** Momento local de la última subida. */
  lastPushedAt: string | null;
}

export interface SyncResult {
  state: SyncState;
  pulled: number;
  pushed: number;
}

/**
 * Una pasada de sincronización: descarga y aplica lo nuevo del servidor y
 * después sube lo cambiado localmente desde la última subida.
 */
export async function syncOnce(local: LocalSyncSource, remote: RemoteSyncTarget, state: SyncState, now = new Date()): Promise<SyncResult> {
  const startedAt = now.toISOString();
  const { changes: incoming, cursor } = await remote.pull(state.remoteCursor);
  const pulled = await local.apply(incoming);
  const outgoing = await local.changesSince(state.lastPushedAt);
  const pushed = countChanges(outgoing);
  if (pushed > 0) await remote.push(outgoing);
  return { state: { remoteCursor: cursor ?? state.remoteCursor, lastPushedAt: startedAt }, pulled, pushed };
}
