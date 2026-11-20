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

export interface SyncMeta {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export type HabitCategory =
  | 'health'
  | 'exercise'
  | 'hydration'
  | 'study'
  | 'work'
  | 'food'
  | 'sleep'
  | 'productivity'
  | 'wellbeing'
  | 'custom';

/**
 * - check: se completa marcando una casilla (meta = 1).
 * - quantity: cantidad con unidad, p. ej. 2.5 L de agua.
 * - duration: tiempo en minutos, con cronómetro o registro manual.
 * - count: número de veces al día, p. ej. caminar 2 veces.
 */
export type TrackingType = 'check' | 'quantity' | 'duration' | 'count';

/** daily = todos los días · weekly = días concretos · interval = cada N días. */
export type HabitFrequency = 'daily' | 'weekly' | 'interval';

/** Periodo en pausa; `to` null mientras siga pausado. Los días pausados no cuentan. */
export interface PausePeriod {
  from: DateKey;
  to: DateKey | null;
}

export interface Habit extends SyncMeta {
  id: string;
  name: string;
  description: string | null;
  category: HabitCategory;
  icon: string;
  color: string;
  trackingType: TrackingType;
  /** Meta diaria: 1 (check), cantidad en `unit`, minutos (duration) o veces (count). */
  target: number;
  unit: string | null;
  frequency: HabitFrequency;
  /** Días en los que toca (frequency = weekly). Para daily contiene los 7. */
  daysOfWeek: Weekday[];
  /** Cada cuántos días toca (frequency = interval), contando desde `startDate`. */
  intervalDays: number;
  startDate: DateKey;
  endDate: DateKey | null;
  suggestedTime: TimeOfDay | null;
  reminderTimes: TimeOfDay[];
  /** Ids de notificaciones programadas en este dispositivo. No se sincronizan. */
  notificationIds: string[];
  pauses: PausePeriod[];
  archived: boolean;
  sortOrder: number;
}

export interface HabitLog extends SyncMeta {
  id: string;
  habitId: string;
  date: DateKey;
  /** Progreso del día en la unidad del hábito (veces, minutos, litros…). */
  value: number;
}

/** Cada vaso/botella registrado en el módulo de hidratación. */
export interface WaterLog extends SyncMeta {
  id: string;
  date: DateKey;
  amountMl: number;
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
export type WaterUnit = 'ml' | 'L';

/** Cronómetro en curso de un hábito por duración (sobrevive a cerrar la app). */
export interface ActiveTimer {
  habitId: string;
  date: DateKey;
  /** Momento en que se reanudó por última vez; null si está en pausa. */
  runningSince: ISODateTime | null;
  /** Milisegundos acumulados en tramos anteriores. */
  accumulatedMs: number;
}

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
  waterGoalMl: number;
  waterUnit: WaterUnit;
  waterReminderEnabled: boolean;
  waterReminderStart: TimeOfDay;
  waterReminderEnd: TimeOfDay;
  waterReminderEveryMinutes: number;
  waterNotificationIds: string[];
  activeTimer: ActiveTimer | null;
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
  waterGoalMl: 2500,
  waterUnit: 'L',
  waterReminderEnabled: false,
  waterReminderStart: '09:00',
  waterReminderEnd: '21:00',
  waterReminderEveryMinutes: 120,
  waterNotificationIds: [],
  activeTimer: null,
};

/** Índice en memoria de progreso: fecha → hábito → valor. */
export type LogIndex = Record<DateKey, Record<string, number>>;

/** Campos que el usuario edita en el formulario. */
export type HabitInput = Pick<
  Habit,
  | 'name'
  | 'description'
  | 'category'
  | 'icon'
  | 'color'
  | 'trackingType'
  | 'target'
  | 'unit'
  | 'frequency'
  | 'daysOfWeek'
  | 'intervalDays'
  | 'startDate'
  | 'endDate'
  | 'suggestedTime'
  | 'reminderTimes'
>;

export type SleepInput = {
  date: DateKey;
  bedtime: TimeOfDay;
  wakeTime: TimeOfDay;
  quality: number;
  notes: string | null;
};
