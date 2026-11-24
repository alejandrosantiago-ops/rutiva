import { create } from 'zustand';
import { repositories } from '@/data/repositories';
import { discardSession, elapsedMs, finishSession, pauseSession, resumeSession } from '@/domain/timer';
import { targetOn } from '@/domain/habits';
import { clearTimerNotifications, showTimerNotifications } from '@/services/notifications/timer';
import type { DateKey, TimedSession } from '@/domain/types';
import { useHabitStore } from './useHabitStore';

/**
 * Cronómetro de hábitos por duración. Solo puede haber uno activo (índice
 * único en `timed_sessions`). El estado vive en SQLite, así que sobrevive a
 * cerrar la app, y las sesiones terminadas quedan como historial.
 */
interface TimerState {
  session: TimedSession | null;
  load: () => Promise<void>;
  start: (habitId: string, date: DateKey) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Detiene y suma los minutos al día en que empezó. Devuelve los minutos añadidos. */
  finish: () => Promise<number>;
  discard: () => Promise<void>;
}

/** Aviso "en marcha" y aviso de meta mientras el cronómetro corre. */
function syncNotifications(session: TimedSession | null) {
  if (!session || session.status !== 'running' || !session.habitId || !session.runningSince) {
    clearTimerNotifications().catch(() => undefined);
    return;
  }
  const habit = useHabitStore.getState().habits.find((h) => h.id === session.habitId);
  if (!habit) return;
  const date = session.date ?? session.startedAt.slice(0, 10);
  const target = targetOn(habit, date);
  const done = useHabitStore.getState().currentValue(habit.id, date) + elapsedMs(session, Date.now()) / 60000;
  showTimerNotifications({
    habitId: habit.id,
    habitName: habit.name,
    runningSince: session.runningSince,
    remainingMinutes: Math.ceil(target - done),
    targetMinutes: target,
  }).catch(() => undefined);
}

export const useTimerStore = create<TimerState>((set, get) => {
  async function persist(next: TimedSession) {
    const saved = await repositories.sessions.save(next);
    const active = saved.status === 'running' || saved.status === 'paused' ? saved : null;
    set({ session: active });
    syncNotifications(active);
    return saved;
  }

  return {
    session: null,

    async load() {
      const session = await repositories.sessions.active('habit');
      set({ session });
      syncNotifications(session);
    },

    async start(habitId, date) {
      if (get().session) throw new Error('Ya hay un cronómetro en marcha.');
      const session = await repositories.sessions.start('habit', new Date().toISOString(), habitId, date);
      set({ session });
      syncNotifications(session);
    },

    async pause() {
      const s = get().session;
      if (s) await persist(pauseSession(s, Date.now()));
    },

    async resume() {
      const s = get().session;
      if (s) await persist(resumeSession(s, Date.now()));
    },

    async finish() {
      const s = get().session;
      if (!s) return 0;
      const done = await persist(finishSession(s, Date.now()));
      const minutes = done.resultMinutes ?? 0;
      if (minutes > 0 && done.habitId && done.date) await useHabitStore.getState().addProgress(done.habitId, done.date, minutes);
      return minutes;
    },

    async discard() {
      const s = get().session;
      if (s) await persist(discardSession(s, Date.now()));
    },
  };
});
