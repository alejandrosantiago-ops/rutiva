import * as Crypto from 'expo-crypto';
import { getDb } from '@/data/db/client';
import { createSqliteRepositories } from '@/data/repositories/sqlite';
import type { Repositories } from '@/data/repositories/types';

/**
 * Punto único de acceso a la persistencia.
 * Para migrar a Supabase: crea un adaptador que implemente `Repositories`
 * (o que sincronice SQLite ↔ Supabase usando `updated_at` y `deleted_at`) y
 * cámbialo aquí. Nada más en la app cambia.
 */
export const repositories: Repositories = createSqliteRepositories({ getDb, uuid: () => Crypto.randomUUID() });

export type * from '@/data/repositories/types';
