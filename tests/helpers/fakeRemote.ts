import { emptyChanges, type RemoteSyncTarget, type SyncChanges } from '../../src/data/sync/engine.ts';

/**
 * Servidor de sincronización en memoria que se comporta como la función
 * `rutiva_push` de supabase/schema.sql: guarda cada registro solo si es más
 * reciente que el que tiene, y numera cada escritura con un cursor propio
 * (equivalente a `synced_at`, el reloj del servidor).
 */
export function createFakeRemote(): RemoteSyncTarget & { size(): number } {
  let seq = 0;
  type Entry<T> = { row: T; updatedAt: string; seq: number };
  const tables = {
    habits: new Map<string, Entry<SyncChanges['habits'][number]>>(),
    logs: new Map<string, Entry<SyncChanges['logs'][number]>>(),
    water: new Map<string, Entry<SyncChanges['water'][number]>>(),
    sleep: new Map<string, Entry<SyncChanges['sleep'][number]>>(),
  };
  let settings: (NonNullable<SyncChanges['settings']> & { seq: number }) | null = null;

  function put<T extends { updatedAt: string }>(table: Map<string, Entry<T>>, key: string, row: T) {
    const prev = table.get(key);
    if (prev && prev.updatedAt >= row.updatedAt) return; // gana el más reciente
    table.set(key, { row: structuredClone(row), updatedAt: row.updatedAt, seq: ++seq });
  }

  return {
    size: () => tables.habits.size + tables.logs.size + tables.water.size + tables.sleep.size,
    async push(c) {
      for (const h of c.habits) put(tables.habits, h.id, h);
      for (const l of c.logs) put(tables.logs, `${l.habitId}|${l.date}`, l);
      for (const w of c.water) put(tables.water, w.id, w);
      for (const s of c.sleep) put(tables.sleep, s.id, s);
      if (c.settings && (!settings || c.settings.updatedAt > settings.updatedAt)) settings = { ...structuredClone(c.settings), seq: ++seq };
    },
    async pull(cursor) {
      const after = cursor ? Number(cursor) : 0;
      const out = emptyChanges();
      const take = <T>(table: Map<string, Entry<T>>) => [...table.values()].filter((e) => e.seq > after).map((e) => structuredClone(e.row));
      out.habits = take(tables.habits);
      out.logs = take(tables.logs);
      out.water = take(tables.water);
      out.sleep = take(tables.sleep);
      out.settings = settings && settings.seq > after ? { data: settings.data, updatedAt: settings.updatedAt } : null;
      return { changes: out, cursor: String(seq) };
    },
  };
}
