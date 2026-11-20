/**
 * Entidades del dominio. Son independientes de la capa de persistencia:
 * SQLite hoy, Supabase/PostgreSQL mañana. Todas usan UUID como id y llevan
 * marcas `createdAt`/`updatedAt`/`deletedAt` para permitir sincronización.
 */

export type ISODateTime = string; // 2026-11-20T07:30:00.000Z
export type DateKey = string; // yyyy-MM-dd (fecha local)
export type TimeOfDay = string; // HH:mm (hora local)

/** 0 = domingo … 6 = sábado (igual que Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HabitFrequency = 'daily' | 'custom';

export interface SyncMeta {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export interface Habit extends SyncMeta {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: HabitFrequency;
  /** Días en los que toca el hábito. Para `daily` contiene los 7 días. */
  daysOfWeek: Weekday[];
  /** Veces por día necesarias para darlo por cumplido (1 = sí/no). */
  targetPerDay: number;
  unit: string | null;
  reminderEnabled: boolean;
  reminderTime: TimeOfDay | null;
  /** Ids de notificaciones programadas en este dispositivo. No se sincronizan. */
  notificationIds: string[];
  archived: boolean;
  sortOrder: number;
  /** Primer día que cuenta para rachas y estadísticas. */
  startDate: DateKey;
}

export interface HabitLog extends SyncMeta {
  id: string;
  habitId: string;
  date: DateKey;
  count: number;
}

export interface SleepLog extends SyncMeta {
  id: string;
  /** Día en el que te despertaste; identifica la noche. */
  date: DateKey;
  bedtimeAt: ISODateTime;
  wakeAt: ISODateTime;
  durationMinutes: number;
  /** 1 (muy mala) … 5 (excelente) */
  quality: number;
  notes: string | null;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppSettings {
  userName: string;
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  hapticsEnabled: boolean;
  sleepGoalMinutes: number;
  bedtimeReminderEnabled: boolean;
  bedtimeReminderTime: TimeOfDay;
  bedtimeNotificationId: string | null;
  weekStartsOn: 0 | 1;
}

export const DEFAULT_SETTINGS: AppSettings = {
  userName: '',
  themeMode: 'system',
  notificationsEnabled: true,
  hapticsEnabled: true,
  sleepGoalMinutes: 8 * 60,
  bedtimeReminderEnabled: false,
  bedtimeReminderTime: '22:30',
  bedtimeNotificationId: null,
  weekStartsOn: 1,
};

/** Índice en memoria de registros: fecha → hábito → conteo. */
export type LogIndex = Record<DateKey, Record<string, number>>;

export type HabitInput = Pick<
  Habit,
  | 'name'
  | 'description'
  | 'icon'
  | 'color'
  | 'frequency'
  | 'daysOfWeek'
  | 'targetPerDay'
  | 'unit'
  | 'reminderEnabled'
  | 'reminderTime'
>;

export type SleepInput = {
  date: DateKey;
  bedtime: TimeOfDay;
  wakeTime: TimeOfDay;
  quality: number;
  notes: string | null;
};
