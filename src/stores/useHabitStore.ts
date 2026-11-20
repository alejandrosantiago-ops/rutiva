import { create } from 'zustand';
import { repositories } from '@/repositories';
import type { HabitPatch } from '@/repositories';
import { shiftKey, todayKey } from '@/domain/dates';
import { getValue, isPaused, nextScheduleHistory, targetOn } from '@/domain/habits';
import { isWaterHabit, mlToUnit, unitToMl, waterTotals } from '@/domain/water';
import type { DateKey, Habit, HabitInput, LogIndex } from '@/domain/types';
import { cancelNotifications, scheduleHabitReminders } from '@/services/notifications';
import { useSettingsStore } from './useSettingsStore';
import { useWaterStore } from './useWaterStore';

interface HabitState {
  habits: Habit[];
  /** Progreso guardado por hábito y día. Para el progreso efectivo usa `useLogIndex()`. */
  logs: LogIndex;
  loaded: boolean;
  load: () => Promise<void>;
  createHabit: (input: HabitInput) => Promise<Habit>;
  updateHabit: (id: string, input: Partial<HabitInput>) => Promise<Habit>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  setPaused: (id: string, paused: boolean) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  /** Fija el progreso del día (en la unidad del hábito). */
  setValue: (habitId: string, date: DateKey, value: number) => Promise<void>;
  /** Suma (o resta, si es negativo) progreso al día. */
  addProgress: (habitId: string, date: DateKey, delta: number) => Promise<void>;
  /** Acción rápida del botón: marca/desmarca (simple) o suma una vez (frecuencia). */
  quickAction: (habitId: string, date: DateKey) => Promise<number>;
  /** Reprograma los recordatorios de todos los hábitos. */
  rescheduleAll: () => Promise<void>;
}

const notificationsOn = () => useSettingsStore.getState().settings.notificationsEnabled;

function withValue(logs: LogIndex, habitId: string, date: DateKey, value: number): LogIndex {
  const day = { ...(logs[date] ?? {}) };
  if (value > 0) day[habitId] = value;
  else delete day[habitId];
  return { ...logs, [date]: day };
}

/** Progreso actual teniendo en cuenta el módulo de agua. */
function currentValue(habit: Habit, logs: LogIndex, date: DateKey): number {
  if (!isWaterHabit(habit)) return getValue(logs, habit.id, date);
  return mlToUnit(waterTotals(useWaterStore.getState().logs)[date] ?? 0, habit.unit);
}

export const useHabitStore = create<HabitState>((set, get) => {
  async function syncReminders(habit: Habit): Promise<Habit> {
    const ids = await scheduleHabitReminders(habit, notificationsOn()).catch(() => [] as string[]);
    const same = ids.length === habit.notificationIds.length && ids.every((id, i) => id === habit.notificationIds[i]);
    if (same) return habit;
    return repositories.habits.update(habit.id, { notificationIds: ids });
  }

  function replace(habit: Habit) {
    set((s) => ({ habits: s.habits.map((h) => (h.id === habit.id ? habit : h)) }));
  }

  async function patch(id: string, changes: HabitPatch) {
    const updated = await repositories.habits.update(id, changes);
    replace(updated);
    replace(await syncReminders(updated));
  }

  return {
    habits: [],
    logs: {},
    loaded: false,

    async load() {
      const [habits, logs] = await Promise.all([repositories.habits.list(), repositories.logs.list()]);
      const index: LogIndex = {};
      for (const l of logs) (index[l.date] ??= {})[l.habitId] = l.value;
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
      const habit = get().habits.find((h) => h.id === id);
      if (!habit) throw new Error('Hábito no encontrado');
      // Si cambia la frecuencia o la meta, la regla anterior sigue valiendo para el pasado.
      const scheduleHistory = nextScheduleHistory(habit, input, todayKey());
      await patch(id, { ...input, scheduleHistory });
      return get().habits.find((h) => h.id === id)!;
    },

    async setArchived(id, archived) {
      const habit = get().habits.find((h) => h.id === id);
      if (!habit || habit.archived === archived) return;
      const today = todayKey();
      let pauses = [...habit.pauses];
      const last = pauses[pauses.length - 1];
      if (archived) {
        // Archivar = pausa desde hoy: el historial anterior sigue en calendario y estadísticas.
        if (!isPaused(habit)) pauses.push({ from: today, to: null, reason: 'archive' });
      } else if (last && last.to === null && last.reason === 'archive') {
        if (last.from >= today) pauses = pauses.slice(0, -1);
        else pauses[pauses.length - 1] = { ...last, to: shiftKey(today, -1) };
      }
      await patch(id, { archived, pauses });
    },

    async setPaused(id, paused) {
      const habit = get().habits.find((h) => h.id === id);
      if (!habit || isPaused(habit) === paused) return;
      const today = todayKey();
      let pauses = [...habit.pauses];
      if (paused) {
        pauses.push({ from: today, to: null });
      } else {
        const last = pauses[pauses.length - 1];
        // Pausado y reanudado el mismo día: no deja rastro.
        if (last.from >= today) pauses = pauses.slice(0, -1);
        else pauses[pauses.length - 1] = { ...last, to: shiftKey(today, -1) };
      }
      await patch(id, { pauses });
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

    async setValue(habitId, date, value) {
      const habit = get().habits.find((h) => h.id === habitId);
      if (!habit) return;
      const next = Math.max(0, value);
      // Los hábitos de agua viven en el módulo de hidratación.
      if (isWaterHabit(habit)) return useWaterStore.getState().setDayTotal(date, unitToMl(next, habit.unit));

      const previous = getValue(get().logs, habitId, date);
      set((s) => ({ logs: withValue(s.logs, habitId, date, next) }));
      try {
        await repositories.logs.setValue(habitId, date, next);
      } catch (error) {
        set((s) => ({ logs: withValue(s.logs, habitId, date, previous) }));
        throw error;
      }
    },

    async addProgress(habitId, date, delta) {
      const habit = get().habits.find((h) => h.id === habitId);
      if (!habit) return;
      if (isWaterHabit(habit) && delta > 0) return useWaterStore.getState().add(date, unitToMl(delta, habit.unit));
      await get().setValue(habitId, date, currentValue(habit, get().logs, date) + delta);
    },

    async quickAction(habitId, date) {
      const habit = get().habits.find((h) => h.id === habitId);
      if (!habit) return 0;
      const current = currentValue(habit, get().logs, date);
      // La meta puede haber cambiado: se usa la vigente en esa fecha.
      const target = targetOn(habit, date);
      const next = current >= target ? 0 : habit.trackingType === 'count' ? current + 1 : target;
      await get().setValue(habitId, date, next);
      return next;
    },

    async rescheduleAll() {
      const results = await Promise.all(get().habits.map(syncReminders));
      set({ habits: results });
    },
  };
});
