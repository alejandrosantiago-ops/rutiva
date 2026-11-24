import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from '@/data/db/migrations';

const DATABASE_NAME = 'rutiva.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  // Las migraciones que reconstruyen tablas necesitan las claves foráneas
  // desactivadas (si no, DROP TABLE borraría en cascada el historial).
  // Este PRAGMA no tiene efecto dentro de una transacción, por eso va aquí.
  await db.execAsync('PRAGMA foreign_keys = OFF;');
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
  const broken = await db.getAllAsync('PRAGMA foreign_key_check');
  if (broken.length > 0) throw new Error('La migración dejó referencias rotas en la base de datos');
  await db.execAsync('PRAGMA foreign_keys = ON;');
}

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
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openWithRetry();
      await migrate(db);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
