import { MIGRATIONS } from './migrations';
import type { Db, Migration } from './types';

/**
 * Aplica las migraciones pendientes según `PRAGMA user_version`, cada una en
 * su propia transacción (si falla, no queda a medias).
 *
 * Las claves foráneas se desactivan durante el proceso porque algunas
 * migraciones reconstruyen tablas (DROP + RENAME) y, con ellas activas,
 * borrarían en cascada el historial. Al final se verifica la integridad.
 */
export async function runMigrations(db: Db, migrations: Migration[] = MIGRATIONS, upTo = migrations.length): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= upTo) {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    return version;
  }
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    while (version < upTo) {
      const migration = migrations[version];
      const next = version + 1;
      await db.withTransactionAsync(async () => {
        if (typeof migration === 'string') await db.execAsync(migration);
        else await migration(db);
        // PRAGMA no admite parámetros; `next` es un entero controlado por nosotros.
        await db.execAsync(`PRAGMA user_version = ${next}`);
      });
      version = next;
    }
    const broken = await db.getAllAsync('PRAGMA foreign_key_check');
    if (broken.length > 0) throw new Error('La migración dejó referencias rotas en la base de datos');
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
  return version;
}
