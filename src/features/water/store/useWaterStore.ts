import { create } from 'zustand';
import { repositories } from '@/data/repositories';
import type { DateKey, WaterLog } from '@/domain/types';

interface WaterState {
  logs: WaterLog[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (date: DateKey, amountMl: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Ajusta el total del día añadiendo o quitando los últimos registros. */
  setDayTotal: (date: DateKey, totalMl: number) => Promise<void>;
}

export const useWaterStore = create<WaterState>((set, get) => ({
  logs: [],
  loaded: false,

  async load() {
    set({ logs: await repositories.water.list(), loaded: true });
  },

  async add(date, amountMl) {
    if (amountMl <= 0) return;
    const log = await repositories.water.add(date, amountMl);
    set((s) => ({ logs: [...s.logs, log] }));
  },

  async remove(id) {
    set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
    await repositories.water.remove(id);
  },

  async setDayTotal(date, totalMl) {
    const target = Math.max(0, Math.round(totalMl));
    const day = get().logs.filter((l) => l.date === date);
    let current = day.reduce((a, l) => a + l.amountMl, 0);
    if (target > current) return get().add(date, target - current);
    // Quita desde el registro más reciente hasta quedar por debajo de la meta.
    for (const log of [...day].reverse()) {
      if (current <= target) break;
      await get().remove(log.id);
      current -= log.amountMl;
    }
    if (current < target) await get().add(date, target - current);
  },
}));
