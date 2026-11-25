import { emptyChanges, type SyncChanges } from './engine';

/**
 * Conversión entre los cambios de la app y las filas de `rutiva_records`
 * (ver supabase/schema.sql). Es código puro para poder probarlo.
 */
export interface RemoteRecord {
  kind: 'habit' | 'log' | 'water' | 'sleep' | 'settings';
  key: string;
  data: unknown;
  updated_at: string;
  synced_at?: string;
}

export function toRecords(c: SyncChanges): RemoteRecord[] {
  const out: RemoteRecord[] = [];
  for (const h of c.habits) out.push({ kind: 'habit', key: h.id, data: { ...h, notificationIds: [] }, updated_at: h.updatedAt });
  for (const l of c.logs) out.push({ kind: 'log', key: `${l.habitId}|${l.date}`, data: l, updated_at: l.updatedAt });
  for (const w of c.water) out.push({ kind: 'water', key: w.id, data: w, updated_at: w.updatedAt });
  for (const s of c.sleep) out.push({ kind: 'sleep', key: s.id, data: s, updated_at: s.updatedAt });
  if (c.settings) out.push({ kind: 'settings', key: 'settings', data: c.settings, updated_at: c.settings.updatedAt });
  return out;
}

/** Postgres devuelve "2026-11-25T08:00:00.123+00:00": se normaliza al formato de la app. */
const iso = (v: string) => new Date(v).toISOString();

export function fromRecords(rows: RemoteRecord[]): SyncChanges {
  const c = emptyChanges();
  for (const r of rows) {
    const data = r.data as Record<string, unknown>;
    const updatedAt = iso(r.updated_at);
    switch (r.kind) {
      case 'habit':
        c.habits.push({ ...(data as unknown as SyncChanges['habits'][number]), updatedAt, notificationIds: [] });
        break;
      case 'log':
        c.logs.push({ ...(data as unknown as SyncChanges['logs'][number]), updatedAt });
        break;
      case 'water':
        c.water.push({ ...(data as unknown as SyncChanges['water'][number]), updatedAt });
        break;
      case 'sleep':
        c.sleep.push({ ...(data as unknown as SyncChanges['sleep'][number]), updatedAt });
        break;
      case 'settings': {
        const s = data as unknown as NonNullable<SyncChanges['settings']>;
        if (!c.settings || updatedAt > c.settings.updatedAt) c.settings = { data: s.data ?? {}, updatedAt };
        break;
      }
    }
  }
  return c;
}

/**
 * Los registros que llegan casi a la vez pueden confirmarse fuera de orden;
 * por eso la descarga repasa un pequeño margen antes del cursor. Repetir un
 * registro no hace daño: aplicar es idempotente ("gana el más reciente").
 */
export const PULL_OVERLAP_MS = 60_000;

export function pullFrom(cursor: string | null): string {
  if (!cursor) return '1970-01-01T00:00:00.000Z';
  return new Date(new Date(cursor).getTime() - PULL_OVERLAP_MS).toISOString();
}
