import type { AppSettings, DateKey, Habit, HabitInput, HabitLog, SleepInput, SleepLog } from '@/domain/types';

/**
 * Contratos de persistencia. La UI y los stores solo dependen de estas
 * interfaces; hoy las implementa SQLite (./sqlite) y mañana puede
 * implementarlas un adaptador remoto (Supabase) o uno con sincronización.
 */

export interface HabitRepository {
  list(): Promise<Habit[]>;
  create(input: HabitInput): Promise<Habit>;
  update(id: string, patch: Partial<Omit<Habit, 'id' | 'createdAt'>>): Promise<Habit>;
  /** Borrado lógico (deja tombstone para sincronizar). */
  remove(id: string): Promise<void>;
  reorder(orderedIds: string[]): Promise<void>;
}

export interface HabitLogRepository {
  list(): Promise<HabitLog[]>;
  setCount(habitId: string, date: DateKey, count: number): Promise<HabitLog>;
}

export interface SleepRepository {
  list(): Promise<SleepLog[]>;
  /** Crea o reemplaza el registro de la noche indicada por `input.date`. */
  save(input: SleepInput, id?: string): Promise<SleepLog>;
  remove(id: string): Promise<void>;
}

export interface SettingsRepository {
  load(): Promise<Partial<AppSettings>>;
  save<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
}

export interface BackupPayload {
  app: 'rutiva';
  version: number;
  exportedAt: string;
  habits: Habit[];
  habitLogs: HabitLog[];
  sleepLogs: SleepLog[];
  settings: Partial<AppSettings>;
}

export interface Repositories {
  habits: HabitRepository;
  logs: HabitLogRepository;
  sleep: SleepRepository;
  settings: SettingsRepository;
  exportAll(): Promise<BackupPayload>;
  /** Borra todos los datos locales. */
  resetAll(): Promise<void>;
}
