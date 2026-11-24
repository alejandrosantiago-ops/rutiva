import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrate';
import type { Db } from './types';

const DATABASE_NAME = 'rutiva.db';

let dbPromise: Promise<Db> | null = null;

/**
 * En web, al recargar la página el worker anterior puede tardar un instante en
 * soltar el archivo (OPFS). Se reintenta unas veces antes de dar error.
 */
async function openWithRetry(): Promise<SQLite.SQLiteDatabase> {
  const attempts = Platform.OS === 'web' ? 8 : 1;
  for (let i = 1; ; i++) {
    try {
      return await SQLite.openDatabaseAsync(DATABASE_NAME);
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 250 * i));
    }
  }
}

/** Conexión única y perezosa, migrada antes de devolverse. */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const sqlite = await openWithRetry();
      await sqlite.execAsync('PRAGMA journal_mode = WAL;');
      // expo-sqlite cumple la interfaz Db (API asíncrona).
      const db = sqlite as unknown as Db;
      await runMigrations(db);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
