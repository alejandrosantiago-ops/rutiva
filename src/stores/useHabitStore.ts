import { create } from 'zustand';
import { repositories } from '@/repositories';
import { getCount } from '@/domain/habits';
import type { DateKey, Habit, HabitInput, LogIndex } from '@/domain/types';
import { cancelNotifications, scheduleHabitReminders } from '@/services/notifications';
import { useSettingsStore } from './useSettingsStore';

interface HabitState {
  habits: Habit[];
  logs: LogIndex;
  loaded: boolean;
  load: () => Promise<void>;
  createHabit: (input: HabitInput) => Promise<Habit>;
  updateHabit: (id: string, input: Partial<HabitInput>) => Promise<Habit>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  setCount: (habitId: string, date: DateKey, count: number) => Promise<void>;
  /** Marca/desmarca; en hábitos con meta >1 suma uno hasta completar y luego reinicia. */
  toggle: (habitId: string, date: DateKey) => Promise<number>;
  /** Reprograma los recordatorios de todos los hábitos (p. ej. al cambiar el ajuste global). */
  rescheduleAll: () => Promise<void>;
}

const notificationsOn = () => useSettingsStore.getState().settings.notificationsEnabled;

function withCount(logs: LogIndex, habitId: string, date: DateKey, count: number): LogIndex {
  const day = { ...(logs[date] ?? {}) };
  if (count > 0) day[habitId] = count;
  else delete day[habitId];
  return { ...logs, [date]: day };
}

export const useHabitStore = create<HabitState>((set, get) => {
  /** Programa recordatorios y guarda los ids devueltos. */
  async function syncReminders(habit: Habit): Promise<Habit> {
    const ids = await scheduleHabitReminders(habit, notificationsOn()).catch(() => []);
    const same = ids.length === habit.notificationIds.length && ids.every((id, i) => id === habit.notificationIds[i]);
    if (same) return habit;
    return repositories.habits.update(habit.id, { notificationIds: ids });
  }

  function replace(habit: Habit) {
    set((s) => ({ habits: s.habits.map((h) => (h.id === habit.id ? habit : h)) }));
  }

  return {
    habits: [],
    logs: {},
    loaded: false,

    async load() {
      const [habits, logs] = await Promise.all([repositories.habits.list(), repositories.logs.list()]);
      const index: LogIndex = {};
      for (const l of logs) (index[l.date] ??= {})[l.habitId] = l.count;
      set({ habits, logs: index, loaded: true });
    },

    async createHabit(input) {
      const created = await repositories.habits.create(input);
      set((s) => ({ habits: [...s.habits, created] }));
      const synced = await syncReminders(created);
      replace(synced);
      return synced;
    },

    async updateHabit(id, input) {
      const updated = await repositories.habits.update(id, input);
      replace(updated);
      const synced = await syncReminders(updated);
      replace(synced);
      return synced;
    },

    async setArchived(id, archived) {
      const updated = await repositories.habits.update(id, { archived });
      replace(updated);
      replace(await syncReminders(updated));
    },

    async deleteHabit(id) {
      const habit = get().habits.find((h) => h.id === id);
      if (habit) await cancelNotifications(habit.notificationIds);
      await repositories.habits.remove(id);
      set((s) => ({ habits: s.habits.filter((h) => h.id !== id) }));
    },

    async reorder(orderedIds) {
      const byId = new Map(get().habits.map((h) => [h.id, h]));
      const reordered = orderedIds.map((id, i) => ({ ...byId.get(id)!, sortOrder: i }));
      const rest = get().habits.filter((h) => !orderedIds.includes(h.id));
      set({ habits: [...reordered, ...rest] });
      await repositories.habits.reorder(orderedIds);
    },

    async setCount(habitId, date, count) {
      const previous = getCount(get().logs, habitId, date);
      const next = Math.max(0, count);
      set((s) => ({ logs: withCount(s.logs, habitId, date, next) }));
      try {
        await repositories.logs.setCount(habitId, date, next);
      } catch (error) {
        set((s) => ({ logs: withCount(s.logs, habitId, date, previous) }));
        throw error;
      }
    },

    async toggle(habitId, date) {
      const habit = get().habits.find((h) => h.id === habitId);
      if (!habit) return 0;
      const current = getCount(get().logs, habitId, date);
      let next: number;
      if (habit.targetPerDay <= 1) next = current >= 1 ? 0 : 1;
      else next = current >= habit.targetPerDay ? 0 : current + 1;
      await get().setCount(habitId, date, next);
      return next;
    },

    async rescheduleAll() {
      const results = await Promise.all(get().habits.map(syncReminders));
      set({ habits: results });
    },
  };
});
