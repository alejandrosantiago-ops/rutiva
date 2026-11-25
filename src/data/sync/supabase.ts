import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from 'expo-sqlite/kv-store';
import type { RemoteSyncTarget } from './engine';
import { fromRecords, pullFrom, toRecords, type RemoteRecord } from './records';

/*
 * Conexión con Supabase. Se configura con variables de entorno públicas en
 * `.env.local` (ver README):
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
 * La clave "anon" es pública por diseño: la seguridad la da Row Level Security.
 * La sesión se guarda en el propio SQLite del teléfono (expo-sqlite/kv-store).
 */
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const syncConfigured = !!URL && !!KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!syncConfigured) throw new Error('La sincronización no está configurada.');
  client ??= createClient(URL!, KEY!, {
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

const PAGE = 1000;
const CHUNK = 500;

export const supabaseRemote: RemoteSyncTarget = {
  async pull(cursor) {
    const rows: RemoteRecord[] = [];
    let from = pullFrom(cursor);
    let maxSynced = cursor;
    for (;;) {
      const { data, error } = await supabase()
        .from('rutiva_records')
        .select('kind, key, data, updated_at, synced_at')
        .gt('synced_at', from)
        .order('synced_at', { ascending: true })
        .limit(PAGE);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as RemoteRecord[];
      rows.push(...page);
      for (const r of page) if (r.synced_at && (!maxSynced || r.synced_at > maxSynced)) maxSynced = new Date(r.synced_at).toISOString();
      if (page.length < PAGE) break;
      from = page[page.length - 1].synced_at!;
    }
    return { changes: fromRecords(rows), cursor: maxSynced };
  },

  async push(changes) {
    const records = toRecords(changes);
    for (let i = 0; i < records.length; i += CHUNK) {
      const { error } = await supabase().rpc('rutiva_push', { records: records.slice(i, i + CHUNK) });
      if (error) throw new Error(error.message);
    }
  },
};
