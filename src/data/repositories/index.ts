import { sqliteRepositories } from '@/data/repositories/sqlite';
import type { Repositories } from '@/data/repositories/types';

/**
 * Punto único de acceso a la persistencia.
 * Para migrar a Supabase: crea `./supabase/index.ts` que implemente
 * `Repositories` (o un adaptador que sincronice SQLite ↔ Supabase usando
 * `updated_at` y `deleted_at`) y cámbialo aquí. Nada más en la app cambia.
 */
export const repositories: Repositories = sqliteRepositories;

export type * from '@/data/repositories/types';
