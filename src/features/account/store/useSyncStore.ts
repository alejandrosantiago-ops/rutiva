import { create } from 'zustand';
import AsyncStorage from 'expo-sqlite/kv-store';
import { repositories } from '@/data/repositories';
import { syncOnce, type SyncState } from '@/data/sync/engine';
import { supabase, supabaseRemote, syncConfigured } from '@/data/sync/supabase';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useWaterStore } from '@/features/water/store/useWaterStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { googleIdToken, googleSignOut } from '@/services/auth/google';

/*
 * Cuenta y sincronización (opcional). Sin configuración o sin sesión, la app
 * funciona igual, 100 % local y sin conexión.
 */

const STATE_KEY = 'rutiva.sync.state';
const LAST_KEY = 'rutiva.sync.lastAt';
const MIN_INTERVAL_MS = 60_000;

type Status = 'unconfigured' | 'signedOut' | 'idle' | 'syncing' | 'error';

interface SyncStore {
  status: Status;
  email: string | null;
  lastSyncAt: string | null;
  error: string | null;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<'signedIn' | 'confirmEmail'>;
  /** Entra (o crea la cuenta) con la cuenta de Google del teléfono. */
  signInWithGoogle: () => Promise<'created' | 'signedIn'>;
  signOut: () => Promise<void>;
  /** Sincroniza ahora. `auto` respeta un intervalo mínimo y no muestra errores. */
  syncNow: (opts?: { auto?: boolean }) => Promise<{ pulled: number; pushed: number } | null>;
}

async function readState(): Promise<SyncState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  try {
    return raw ? (JSON.parse(raw) as SyncState) : { remoteCursor: null, lastPushedAt: null };
  } catch {
    return { remoteCursor: null, lastPushedAt: null };
  }
}

/** Recarga lo que se ve en pantalla tras recibir cambios y reprograma avisos. */
async function reloadAfterPull() {
  await useSettingsStore.getState().load();
  await Promise.all([useHabitStore.getState().load(), useSleepStore.getState().load(), useWaterStore.getState().load()]);
  if (useSettingsStore.getState().settings.notificationsEnabled) await useHabitStore.getState().rescheduleAll().catch(() => undefined);
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  status: syncConfigured ? 'signedOut' : 'unconfigured',
  email: null,
  lastSyncAt: null,
  error: null,

  async init() {
    if (!syncConfigured) return;
    const { data } = await supabase().auth.getSession();
    set({
      email: data.session?.user.email ?? null,
      status: data.session ? 'idle' : 'signedOut',
      lastSyncAt: await AsyncStorage.getItem(LAST_KEY),
    });
  },

  async signIn(email, password) {
    const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    set({ email: data.user?.email ?? email, status: 'idle', error: null });
    await get().syncNow();
  },

  async signUp(email, password) {
    const { data, error } = await supabase().auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    if (!data.session) return 'confirmEmail';
    set({ email: data.user?.email ?? email, status: 'idle', error: null });
    await get().syncNow();
    return 'signedIn';
  },

  async signInWithGoogle() {
    const token = await googleIdToken();
    const { data, error } = await supabase().auth.signInWithIdToken({ provider: 'google', token });
    if (error) throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message) ? 'Activa Google en Supabase (Authentication → Providers).' : error.message);
    set({ email: data.user?.email ?? null, status: 'idle', error: null });
    await get().syncNow();
    // Cuenta nueva si se creó hace menos de un minuto.
    const created = data.user?.created_at ? Date.now() - new Date(data.user.created_at).getTime() < 60_000 : false;
    return created ? 'created' : 'signedIn';
  },

  async signOut() {
    await supabase().auth.signOut();
    await googleSignOut();
    // Los datos locales se conservan; solo se olvida el progreso de sincronización.
    await AsyncStorage.removeItem(STATE_KEY);
    await AsyncStorage.removeItem(LAST_KEY);
    set({ status: 'signedOut', email: null, lastSyncAt: null, error: null });
  },

  async syncNow(opts) {
    const { status, lastSyncAt } = get();
    if (status === 'unconfigured' || status === 'signedOut' || status === 'syncing') return null;
    if (opts?.auto && lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() < MIN_INTERVAL_MS) return null;
    set({ status: 'syncing', error: null });
    try {
      const result = await syncOnce(repositories.sync, supabaseRemote, await readState());
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(result.state));
      const at = new Date().toISOString();
      await AsyncStorage.setItem(LAST_KEY, at);
      if (result.pulled > 0) await reloadAfterPull();
      set({ status: 'idle', lastSyncAt: at });
      return { pulled: result.pulled, pushed: result.pushed };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ status: 'error', error: message });
      if (opts?.auto) return null;
      throw new Error(/network|fetch/i.test(message) ? 'Sin conexión. Tus datos están a salvo en el teléfono; se sincronizarán más tarde.' : message);
    }
  },
}));
