import { create } from 'zustand';
import { repositories } from '@/repositories';
import type { SleepInput, SleepLog } from '@/domain/types';

interface SleepState {
  logs: SleepLog[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (input: SleepInput, id?: string) => Promise<SleepLog>;
  remove: (id: string) => Promise<void>;
}

const byDateDesc = (a: SleepLog, b: SleepLog) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export const useSleepStore = create<SleepState>((set) => ({
  logs: [],
  loaded: false,

  async load() {
    set({ logs: await repositories.sleep.list(), loaded: true });
  },

  async save(input, id) {
    const saved = await repositories.sleep.save(input, id);
    // El repositorio puede haber reemplazado otra noche con la misma fecha.
    set((s) => ({
      logs: [...s.logs.filter((l) => l.id !== saved.id && l.date !== saved.date), saved].sort(byDateDesc),
    }));
    return saved;
  },

  async remove(id) {
    await repositories.sleep.remove(id);
    set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
  },
}));
