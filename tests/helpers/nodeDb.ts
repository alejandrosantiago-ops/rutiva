import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlValue } from '../../src/data/db/types.ts';

/** Adapta node:sqlite (síncrono) a la interfaz asíncrona que usa la app. */
export function createNodeDb(file = ':memory:'): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(file);
  let depth = 0;
  return {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...params: SqlValue[]) {
      return raw.prepare(sql).run(...params);
    },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) {
      // Igual que expo-sqlite: transacción simple (sin anidar).
      if (depth > 0) return task();
      depth++;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
  };
}
