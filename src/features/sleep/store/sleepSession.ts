import { create } from 'zustand';
import { repositories } from '@/data/repositories';
import { discardSession, finishSession } from '@/domain/timer';
import type { TimedSession } from '@/domain/types';

/**
 * Registro de sueño por temporizador: "Voy a dormir" crea una sesión en
 * `timed_sessions` y "Me desperté" abre el formulario para revisarla. La
 * sesión se cierra al guardar el registro (o se descarta).
 *
 * Importante: un temporizador mide tiempo en cama, no detecta el sueño. Los
 * registros creados así se guardan con origen 'timer' y se muestran como
 * "Estimado".
 */
interface SleepSessionState {
  session: TimedSession | null;
  load: () => Promise<void>;
  start: () => Promise<void>;
  /** Marca la sesión como terminada (se llama al guardar el registro). */
  complete: (wakeAt: string) => Promise<void>;
  discard: () => Promise<void>;
}

export const useSleepSessionStore = create<SleepSessionState>((set, get) => ({
  session: null,

  async load() {
    set({ session: await repositories.sessions.active('sleep') });
  },

  async start() {
    if (get().session) return;
    set({ session: await repositories.sessions.start('sleep', new Date().toISOString()) });
  },

  async complete(wakeAt) {
    const s = get().session;
    if (!s) return;
    await repositories.sessions.save(finishSession(s, new Date(wakeAt).getTime()));
    set({ session: null });
  },

  async discard() {
    const s = get().session;
    if (!s) return;
    await repositories.sessions.save(discardSession(s, Date.now()));
    set({ session: null });
  },
}));
