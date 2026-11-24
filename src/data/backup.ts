import type { AppSettings, Habit, HabitLog, SleepLog, TimedSession, WakeAlarm, WaterLog, Weekday } from '@/domain/types';
import type { BackupPayload } from './repositories/types';

/**
 * Lectura y validación de copias de seguridad. Acepta copias de versiones
 * anteriores de la app y completa los campos que entonces no existían.
 */
export const BACKUP_VERSION = 5;

export class BackupError extends Error {}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const ALL: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function normalizeHabit(h: Raw): Habit {
  const legacyTarget = num(h.targetPerDay, 0);
  const tracking = (str(h.trackingType) || (legacyTarget > 1 ? 'count' : 'check')) as Habit['trackingType'];
  const legacyReminder = h.reminderEnabled === true && TIME.test(str(h.reminderTime)) ? [str(h.reminderTime)] : [];
  const days = Array.isArray(h.daysOfWeek) ? (h.daysOfWeek.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) as Weekday[]) : ALL;
  const frequency = str(h.frequency) === 'custom' ? 'weekly' : ((str(h.frequency) || 'daily') as Habit['frequency']);
  const startDate = DATE.test(str(h.startDate)) ? str(h.startDate) : str(h.createdAt).slice(0, 10);
  if (!str(h.id) || !str(h.name).trim() || !DATE.test(startDate)) throw new BackupError('Hay un hábito con datos incompletos.');
  return {
    id: str(h.id),
    name: str(h.name).trim(),
    description: typeof h.description === 'string' ? h.description : null,
    category: (str(h.category) || 'custom') as Habit['category'],
    icon: str(h.icon, 'target'),
    color: str(h.color, '#5B5BD6'),
    trackingType: tracking,
    target: num(h.target, legacyTarget || 1) || 1,
    unit: typeof h.unit === 'string' ? h.unit : null,
    frequency,
    daysOfWeek: days.length ? days : ALL,
    intervalDays: Math.max(1, num(h.intervalDays, 1)),
    startDate,
    endDate: DATE.test(str(h.endDate)) ? str(h.endDate) : null,
    suggestedTime: TIME.test(str(h.suggestedTime)) ? str(h.suggestedTime) : null,
    reminderTimes: Array.isArray(h.reminderTimes) ? (h.reminderTimes.filter((t) => TIME.test(str(t))) as string[]) : legacyReminder,
    remindersEnabled: h.remindersEnabled !== false,
    reminderMessages: isObj(h.reminderMessages) ? (h.reminderMessages as Record<string, string>) : {},
    notificationIds: [],
    pauses: arr(h.pauses).map((p) => ({ from: str(p.from), to: p.to === null ? null : str(p.to), ...(p.reason === 'archive' ? { reason: 'archive' as const } : {}) })),
    scheduleHistory: arr(h.scheduleHistory).map((r) => ({
      until: str(r.until),
      frequency: str(r.frequency, 'daily') as Habit['frequency'],
      daysOfWeek: (Array.isArray(r.daysOfWeek) ? r.daysOfWeek : ALL) as Weekday[],
      intervalDays: Math.max(1, num(r.intervalDays, 1)),
      target: num(r.target, 1) || 1,
    })),
    archived: h.archived === true,
    sortOrder: num(h.sortOrder),
    createdAt: str(h.createdAt, new Date().toISOString()),
    updatedAt: str(h.updatedAt, new Date().toISOString()),
    deletedAt: typeof h.deletedAt === 'string' ? h.deletedAt : null,
  };
}

/** Convierte el texto de un archivo en una copia válida o lanza BackupError con un motivo legible. */
export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('El archivo no es una copia de Rutiva válida (no es JSON).');
  }
  if (!isObj(raw) || raw.app !== 'rutiva') throw new BackupError('El archivo no es una copia de seguridad de Rutiva.');
  const version = num(raw.version, 1);
  if (version > BACKUP_VERSION) throw new BackupError('La copia es de una versión más nueva de Rutiva. Actualiza la app para importarla.');

  const habits = arr(raw.habits).map(normalizeHabit);
  const ids = new Set(habits.map((h) => h.id));
  const habitLogs: HabitLog[] = arr(raw.habitLogs)
    .filter((l) => ids.has(str(l.habitId)) && DATE.test(str(l.date)))
    .map((l) => ({
      id: str(l.id),
      habitId: str(l.habitId),
      date: str(l.date),
      value: Math.max(0, num(l.value, num(l.count))),
      createdAt: str(l.createdAt),
      updatedAt: str(l.updatedAt),
      deletedAt: null,
    }));
  const waterLogs: WaterLog[] = arr(raw.waterLogs)
    .filter((w) => DATE.test(str(w.date)) && num(w.amountMl) > 0)
    .map((w) => ({ id: str(w.id), date: str(w.date), amountMl: Math.round(num(w.amountMl)), createdAt: str(w.createdAt), updatedAt: str(w.updatedAt), deletedAt: null }));
  const sleepLogs: SleepLog[] = arr(raw.sleepLogs)
    .filter((s) => DATE.test(str(s.date)) && str(s.bedtimeAt) && str(s.wakeAt))
    .map((s) => ({
      id: str(s.id),
      date: str(s.date),
      bedtimeAt: str(s.bedtimeAt),
      wakeAt: str(s.wakeAt),
      latencyMinutes: num(s.latencyMinutes),
      durationMinutes: num(s.durationMinutes),
      quality: Math.min(5, Math.max(1, num(s.quality, 3))),
      notes: typeof s.notes === 'string' ? s.notes : null,
      source: (str(s.source) || 'manual') as SleepLog['source'],
      externalId: typeof s.externalId === 'string' ? s.externalId : null,
      createdAt: str(s.createdAt),
      updatedAt: str(s.updatedAt),
      deletedAt: null,
    }));
  // Solo sesiones cerradas: una sesión "en curso" de otro dispositivo no tiene sentido aquí.
  const timedSessions = arr(raw.timedSessions).filter(
    (s) => (s.status === 'finished' || s.status === 'discarded') && (s.kind === 'sleep' || ids.has(str(s.habitId))),
  ) as unknown as TimedSession[];
  const wakeAlarms = arr(raw.wakeAlarms)
    .filter((a) => TIME.test(str(a.time)))
    .map((a) => ({ ...(a as unknown as WakeAlarm), notificationIds: [] }));
  const settings = (isObj(raw.settings) ? raw.settings : {}) as Partial<AppSettings>;

  if (habits.length + habitLogs.length + waterLogs.length + sleepLogs.length === 0 && !isObj(raw.settings)) {
    throw new BackupError('La copia está vacía.');
  }
  return {
    app: 'rutiva',
    version,
    exportedAt: str(raw.exportedAt),
    habits,
    habitLogs,
    waterLogs,
    sleepLogs,
    timedSessions,
    wakeAlarms,
    settings,
  };
}

export function describeBackup(b: BackupPayload): string {
  const parts = [
    `${b.habits.filter((h) => !h.deletedAt).length} hábitos`,
    `${b.habitLogs.length} registros`,
    `${b.waterLogs.length} de agua`,
    `${b.sleepLogs.length} noches`,
  ];
  return parts.join(', ');
}
