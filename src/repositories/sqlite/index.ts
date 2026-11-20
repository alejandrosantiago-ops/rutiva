import * as Crypto from 'expo-crypto';
import { getDb } from '@/db/client';
import { todayKey } from '@/domain/dates';
import { computeSleepWindow } from '@/domain/sleep';
import type { AppSettings, Habit, HabitLog, SleepLog, Weekday } from '@/domain/types';
import type { BackupPayload, Repositories } from '../types';

const now = () => new Date().toISOString();
const uuid = () => Crypto.randomUUID();

// ---------- Filas tal como están en SQLite ----------

interface HabitRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: 'daily' | 'custom';
  days_of_week: string;
  target_per_day: number;
  unit: string | null;
  reminder_enabled: number;
  reminder_time: string | null;
  notification_ids: string;
  archived: number;
  sort_order: number;
  start_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LogRow {
  id: string;
  habit_id: string;
  date: string;
  count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SleepRow {
  id: string;
  date: string;
  bedtime_at: string;
  wake_at: string;
  duration_minutes: number;
  quality: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const toHabit = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  description: r.description,
  icon: r.icon,
  color: r.color,
  frequency: r.frequency,
  daysOfWeek: parseJson<Weekday[]>(r.days_of_week, [0, 1, 2, 3, 4, 5, 6]),
  targetPerDay: r.target_per_day,
  unit: r.unit,
  reminderEnabled: r.reminder_enabled === 1,
  reminderTime: r.reminder_time,
  notificationIds: parseJson<string[]>(r.notification_ids, []),
  archived: r.archived === 1,
  sortOrder: r.sort_order,
  startDate: r.start_date,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toLog = (r: LogRow): HabitLog => ({
  id: r.id,
  habitId: r.habit_id,
  date: r.date,
  count: r.count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toSleep = (r: SleepRow): SleepLog => ({
  id: r.id,
  date: r.date,
  bedtimeAt: r.bedtime_at,
  wakeAt: r.wake_at,
  durationMinutes: r.duration_minutes,
  quality: r.quality,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

/** Columnas editables de un hábito → nombre de columna y serializador. */
const HABIT_COLUMNS: { [K in keyof Habit]?: [string, (v: Habit[K]) => string | number | null] } = {
  name: ['name', (v) => v],
  description: ['description', (v) => v],
  icon: ['icon', (v) => v],
  color: ['color', (v) => v],
  frequency: ['frequency', (v) => v],
  daysOfWeek: ['days_of_week', (v) => JSON.stringify(v)],
  targetPerDay: ['target_per_day', (v) => v],
  unit: ['unit', (v) => v],
  reminderEnabled: ['reminder_enabled', (v) => (v ? 1 : 0)],
  reminderTime: ['reminder_time', (v) => v],
  notificationIds: ['notification_ids', (v) => JSON.stringify(v)],
  archived: ['archived', (v) => (v ? 1 : 0)],
  sortOrder: ['sort_order', (v) => v],
  startDate: ['start_date', (v) => v],
  deletedAt: ['deleted_at', (v) => v],
};

export const sqliteRepositories: Repositories = {
  habits: {
    async list() {
      const db = await getDb();
      const rows = await db.getAllAsync<HabitRow>(
        'SELECT * FROM habits WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC',
      );
      return rows.map(toHabit);
    },

    async create(input) {
      const db = await getDb();
      const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM habits');
      const ts = now();
      const habit: Habit = {
        ...input,
        id: uuid(),
        notificationIds: [],
        archived: false,
        sortOrder: (max?.m ?? -1) + 1,
        startDate: todayKey(),
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.runAsync(
        `INSERT INTO habits (id, name, description, icon, color, frequency, days_of_week, target_per_day, unit,
          reminder_enabled, reminder_time, notification_ids, archived, sort_order, start_date, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        habit.id,
        habit.name,
        habit.description,
        habit.icon,
        habit.color,
        habit.frequency,
        JSON.stringify(habit.daysOfWeek),
        habit.targetPerDay,
        habit.unit,
        habit.reminderEnabled ? 1 : 0,
        habit.reminderTime,
        '[]',
        0,
        habit.sortOrder,
        habit.startDate,
        ts,
        ts,
      );
      return habit;
    },

    async update(id, patch) {
      const db = await getDb();
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      for (const key of Object.keys(patch) as (keyof Habit)[]) {
        const column = HABIT_COLUMNS[key] as [string, (v: unknown) => string | number | null] | undefined;
        if (!column) continue;
        sets.push(`${column[0]} = ?`);
        values.push(column[1](patch[key as keyof typeof patch]));
      }
      sets.push('updated_at = ?');
      values.push(now());
      await db.runAsync(`UPDATE habits SET ${sets.join(', ')} WHERE id = ?`, ...values, id);
      const row = await db.getFirstAsync<HabitRow>('SELECT * FROM habits WHERE id = ?', id);
      if (!row) throw new Error('Hábito no encontrado');
      return toHabit(row);
    },

    async remove(id) {
      const db = await getDb();
      const ts = now();
      await db.runAsync('UPDATE habits SET deleted_at = ?, updated_at = ?, notification_ids = ? WHERE id = ?', ts, ts, '[]', id);
    },

    async reorder(orderedIds) {
      const db = await getDb();
      const ts = now();
      await db.withTransactionAsync(async () => {
        for (let i = 0; i < orderedIds.length; i++) {
          await db.runAsync('UPDATE habits SET sort_order = ?, updated_at = ? WHERE id = ?', i, ts, orderedIds[i]);
        }
      });
    },
  },

  logs: {
    async list() {
      const db = await getDb();
      const rows = await db.getAllAsync<LogRow>('SELECT * FROM habit_logs WHERE deleted_at IS NULL AND count > 0');
      return rows.map(toLog);
    },

    async setCount(habitId, date, count) {
      const db = await getDb();
      const ts = now();
      const safe = Math.max(0, Math.round(count));
      // Upsert: un registro por hábito y día. Un conteo 0 se conserva como "desmarcado".
      await db.runAsync(
        `INSERT INTO habit_logs (id, habit_id, date, count, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (habit_id, date) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at, deleted_at = NULL`,
        uuid(),
        habitId,
        date,
        safe,
        ts,
        ts,
      );
      const row = await db.getFirstAsync<LogRow>('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?', habitId, date);
      return toLog(row!);
    },
  },

  sleep: {
    async list() {
      const db = await getDb();
      const rows = await db.getAllAsync<SleepRow>('SELECT * FROM sleep_logs WHERE deleted_at IS NULL ORDER BY date DESC');
      return rows.map(toSleep);
    },

    async save(input, id) {
      const db = await getDb();
      const ts = now();
      const window = computeSleepWindow(input.date, input.bedtime, input.wakeTime);
      let result!: SleepLog;
      await db.withTransactionAsync(async () => {
        // Si se edita y cambia la fecha, o ya existe otra noche ese día, se reemplaza.
        const clash = await db.getFirstAsync<SleepRow>(
          'SELECT * FROM sleep_logs WHERE date = ? AND deleted_at IS NULL AND id != ?',
          input.date,
          id ?? '',
        );
        if (clash) await db.runAsync('UPDATE sleep_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, clash.id);

        const existing = id ? await db.getFirstAsync<SleepRow>('SELECT * FROM sleep_logs WHERE id = ?', id) : null;
        const finalId = existing?.id ?? uuid();
        if (existing) {
          await db.runAsync(
            `UPDATE sleep_logs SET date = ?, bedtime_at = ?, wake_at = ?, duration_minutes = ?, quality = ?, notes = ?, updated_at = ?
             WHERE id = ?`,
            input.date,
            window.bedtimeAt,
            window.wakeAt,
            window.durationMinutes,
            input.quality,
            input.notes,
            ts,
            finalId,
          );
        } else {
          await db.runAsync(
            `INSERT INTO sleep_logs (id, date, bedtime_at, wake_at, duration_minutes, quality, notes, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            finalId,
            input.date,
            window.bedtimeAt,
            window.wakeAt,
            window.durationMinutes,
            input.quality,
            input.notes,
            ts,
            ts,
          );
        }
        const row = await db.getFirstAsync<SleepRow>('SELECT * FROM sleep_logs WHERE id = ?', finalId);
        result = toSleep(row!);
      });
      return result;
    },

    async remove(id) {
      const db = await getDb();
      const ts = now();
      await db.runAsync('UPDATE sleep_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, id);
    },
  },

  settings: {
    async load() {
      const db = await getDb();
      const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
      const out: Record<string, unknown> = {};
      for (const r of rows) out[r.key] = parseJson(r.value, undefined);
      return out as Partial<AppSettings>;
    },

    async save(key, value) {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value),
      );
    },
  },

  async exportAll(): Promise<BackupPayload> {
    const [habits, habitLogs, sleepLogs, settings] = await Promise.all([
      this.habits.list(),
      this.logs.list(),
      this.sleep.list(),
      this.settings.load(),
    ]);
    return {
      app: 'rutiva',
      version: 1,
      exportedAt: now(),
      habits: habits.map((h) => ({ ...h, notificationIds: [] })),
      habitLogs,
      sleepLogs,
      settings: { ...settings, bedtimeNotificationId: null },
    };
  },

  async resetAll() {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.execAsync('DELETE FROM habit_logs; DELETE FROM habits; DELETE FROM sleep_logs; DELETE FROM settings;');
    });
  },
};
