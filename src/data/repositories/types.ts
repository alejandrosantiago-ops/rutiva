import type {
  AppSettings,
  DateKey,
  Habit,
  HabitInput,
  HabitLog,
  SessionKind,
  SleepInput,
  SleepLog,
  TimedSession,
  TimeOfDay,
  WakeAlarm,
  WakeAlarmInput,
  WaterLog,
} from '@/domain/types';

/**
 * Contratos de persistencia. La UI y los stores solo dependen de estas
 * interfaces; hoy las implementa SQLite (./sqlite) y mañana puede
 * implementarlas un adaptador remoto (Supabase) o uno con sincronización.
 */

export type HabitPatch = Partial<Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'notificationIds'>>;

export interface HabitRepository {
  list(): Promise<Habit[]>;
  create(input: HabitInput): Promise<Habit>;
  update(id: string, patch: HabitPatch): Promise<Habit>;
  /** Guarda los avisos programados en el dispositivo, agrupados por hora de recordatorio. */
  setReminderNotifications(habitId: string, byTime: Record<TimeOfDay, string[]>): Promise<Habit>;
  /** Borrado lógico (deja tombstone para sincronizar y permite deshacer). */
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Habit>;
  reorder(orderedIds: string[]): Promise<void>;
}

export interface HabitLogRepository {
  list(): Promise<HabitLog[]>;
  /** Fija el progreso de un hábito en una fecha (upsert: nunca duplica). */
  setValue(habitId: string, date: DateKey, value: number): Promise<HabitLog>;
}

export interface WaterRepository {
  list(): Promise<WaterLog[]>;
  add(date: DateKey, amountMl: number): Promise<WaterLog>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<WaterLog>;
}

export interface SleepRepository {
  list(): Promise<SleepLog[]>;
  /** Crea o reemplaza el registro de la noche indicada por `input.date`. */
  save(input: SleepInput, id?: string, sessionId?: string | null): Promise<SleepLog>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<SleepLog>;
}

export interface SessionRepository {
  active(kind: SessionKind): Promise<TimedSession | null>;
  /** Falla si ya hay una sesión activa de ese tipo (índice único). */
  start(kind: SessionKind, startedAt: string, habitId?: string, date?: DateKey): Promise<TimedSession>;
  save(session: TimedSession): Promise<TimedSession>;
  history(kind: SessionKind, limit?: number): Promise<TimedSession[]>;
}

export interface WakeAlarmRepository {
  list(): Promise<WakeAlarm[]>;
  save(input: WakeAlarmInput, id?: string): Promise<WakeAlarm>;
  remove(id: string): Promise<void>;
  setNotifications(id: string, notificationIds: string[]): Promise<WakeAlarm>;
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
  waterLogs: WaterLog[];
  sleepLogs: SleepLog[];
  timedSessions: TimedSession[];
  wakeAlarms: WakeAlarm[];
  settings: Partial<AppSettings>;
}

export interface Repositories {
  habits: HabitRepository;
  logs: HabitLogRepository;
  water: WaterRepository;
  sleep: SleepRepository;
  sessions: SessionRepository;
  wakeAlarms: WakeAlarmRepository;
  settings: SettingsRepository;
  exportAll(): Promise<BackupPayload>;
  /** Borra todos los datos locales. */
  resetAll(): Promise<void>;
  /** Sustituye todos los datos locales por los de una copia de seguridad. */
  importAll(backup: BackupPayload): Promise<void>;
}
