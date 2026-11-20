import { create } from 'zustand';
import { repositories } from '@/repositories';
import { DEFAULT_SETTINGS, type AppSettings } from '@/domain/types';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const stored = await repositories.settings.load();
    set({ settings: { ...DEFAULT_SETTINGS, ...stored }, loaded: true });
  },

  async update(key, value) {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    await repositories.settings.save(key, value);
  },

  reset() {
    set({ settings: DEFAULT_SETTINGS });
  },
}));
