/**
 * Subconjunto de la API asíncrona de expo-sqlite que usa la app. Depender de
 * esta interfaz (y no de expo-sqlite) permite ejecutar migraciones y
 * repositorios contra SQLite real en las pruebas (node:sqlite).
 */
export type SqlValue = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Una migración es SQL plano o una función (para transformar datos). */
export type Migration = string | ((db: Db) => Promise<void>);
