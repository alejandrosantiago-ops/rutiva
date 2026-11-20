import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './migrations';

const DATABASE_NAME = 'rutiva.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      // PRAGMA no admite parámetros; `next` es un entero controlado por nosotros.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

/** Conexión única y perezosa, migrada antes de devolverse. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
