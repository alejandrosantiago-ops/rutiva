import * as Crypto from 'expo-crypto';
import { getDb } from '@/data/db/client';
import { sleepDuration } from '@/domain/sleep';
import type { AppSettings, Habit, HabitLog, HabitRule, PausePeriod, SleepLog, WaterLog, Weekday } from '@/domain/types';
import type { BackupPayload, Repositories } from '@/data/repositories/types';

const now = () => new Date().toISOString();
const uuid = () => Crypto.randomUUID();

// ---------- Filas tal como están en SQLite ----------

interface HabitRow {
  id: string;
  name: string;
  description: string | null;
  category: Habit['category'];
  icon: string;
  color: string;
  tracking_type: Habit['trackingType'];
  target: number;
  unit: string | null;
  frequency: Habit['frequency'];
  days_of_week: string;
  interval_days: number;
  start_date: string;
  end_date: string | null;
  suggested_time: string | null;
  reminder_times: string;
  notification_ids: string;
  pauses: string;
  schedule_history: string;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LogRow {
  id: string;
  habit_id: string;
  date: string;
  /** Columna histórica: guarda el valor del día (REAL desde v2). */
  count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface WaterRow {
  id: string;
  date: string;
  amount_ml: number;
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
  latency_minutes: number;
  quality: number;
  notes: string | null;
  source: SleepLog['source'];
  external_id: string | null;
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
  category: r.category,
  icon: r.icon,
  color: r.color,
  trackingType: r.tracking_type,
  target: r.target,
  unit: r.unit,
  frequency: r.frequency,
  daysOfWeek: parseJson<Weekday[]>(r.days_of_week, [0, 1, 2, 3, 4, 5, 6]),
  intervalDays: r.interval_days,
  startDate: r.start_date,
  endDate: r.end_date,
  suggestedTime: r.suggested_time,
  reminderTimes: parseJson<string[]>(r.reminder_times, []),
  notificationIds: parseJson<string[]>(r.notification_ids, []),
  pauses: parseJson<PausePeriod[]>(r.pauses, []),
  scheduleHistory: parseJson<HabitRule[]>(r.schedule_history, []),
  archived: r.archived === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toLog = (r: LogRow): HabitLog => ({
  id: r.id,
  habitId: r.habit_id,
  date: r.date,
  value: r.count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toWater = (r: WaterRow): WaterLog => ({
  id: r.id,
  date: r.date,
  amountMl: r.amount_ml,
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
  latencyMinutes: r.latency_minutes,
  quality: r.quality,
  notes: r.notes,
  source: r.source,
  externalId: r.external_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

type Sql = string | number | null;
const json = (v: unknown) => JSON.stringify(v);
const bool = (v: unknown) => (v ? 1 : 0);
const same = (v: unknown) => v as Sql;

/** Campo del dominio → columna y serializador. */
const HABIT_COLUMNS: Partial<Record<keyof Habit, [string, (v: unknown) => Sql]>> = {
  name: ['name', same],
  description: ['description', same],
  category: ['category', same],
  icon: ['icon', same],
  color: ['color', same],
  trackingType: ['tracking_type', same],
  target: ['target', same],
  unit: ['unit', same],
  frequency: ['frequency', same],
  daysOfWeek: ['days_of_week', json],
  intervalDays: ['interval_days', same],
  startDate: ['start_date', same],
  endDate: ['end_date', same],
  suggestedTime: ['suggested_time', same],
  reminderTimes: ['reminder_times', json],
  notificationIds: ['notification_ids', json],
  pauses: ['pauses', json],
  scheduleHistory: ['schedule_history', json],
  archived: ['archived', bool],
  sortOrder: ['sort_order', same],
  deletedAt: ['deleted_at', same],
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
        pauses: [],
        scheduleHistory: [],
        archived: false,
        sortOrder: (max?.m ?? -1) + 1,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      const entries = (Object.keys(HABIT_COLUMNS) as (keyof Habit)[]).map((k) => {
        const [col, ser] = HABIT_COLUMNS[k]!;
        return [col, ser(habit[k])] as const;
      });
      const cols = ['id', 'created_at', 'updated_at', ...entries.map((e) => e[0])];
      const values: Sql[] = [habit.id, ts, ts, ...entries.map((e) => e[1])];
      await db.runAsync(`INSERT INTO habits (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...values);
      return habit;
    },

    async update(id, patch) {
      const db = await getDb();
      const sets: string[] = [];
      const values: Sql[] = [];
      for (const key of Object.keys(patch) as (keyof Habit)[]) {
        const column = HABIT_COLUMNS[key];
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

    async setValue(habitId, date, value) {
      const db = await getDb();
      const ts = now();
      // Redondeo a 3 decimales para evitar arrastrar errores de coma flotante.
      const safe = Math.max(0, Math.round(value * 1000) / 1000);
      // Un registro por hábito y día. Un valor 0 se conserva como "desmarcado".
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

  water: {
    async list() {
      const db = await getDb();
      const rows = await db.getAllAsync<WaterRow>('SELECT * FROM water_logs WHERE deleted_at IS NULL ORDER BY created_at ASC');
      return rows.map(toWater);
    },

    async add(date, amountMl) {
      const db = await getDb();
      const ts = now();
      const log: WaterLog = { id: uuid(), date, amountMl: Math.round(amountMl), createdAt: ts, updatedAt: ts, deletedAt: null };
      await db.runAsync(
        'INSERT INTO water_logs (id, date, amount_ml, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)',
        log.id,
        log.date,
        log.amountMl,
        ts,
        ts,
      );
      return log;
    },

    async remove(id) {
      const db = await getDb();
      const ts = now();
      await db.runAsync('UPDATE water_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, id);
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
      const duration = sleepDuration(input.bedtimeAt, input.wakeAt, input.latencyMinutes);
      const values = [
        input.date,
        input.bedtimeAt,
        input.wakeAt,
        duration,
        Math.max(0, Math.round(input.latencyMinutes)),
        input.quality,
        input.notes,
        input.source,
        input.externalId ?? null,
      ];
      let result!: SleepLog;
      await db.withTransactionAsync(async () => {
        // Una noche por fecha: si ya existe otra con esa fecha, se reemplaza.
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
            `UPDATE sleep_logs SET date = ?, bedtime_at = ?, wake_at = ?, duration_minutes = ?, latency_minutes = ?, quality = ?,
               notes = ?, source = ?, external_id = ?, updated_at = ? WHERE id = ?`,
            ...values,
            ts,
            finalId,
          );
        } else {
          await db.runAsync(
            `INSERT INTO sleep_logs (date, bedtime_at, wake_at, duration_minutes, latency_minutes, quality, notes, source, external_id,
               id, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            ...values,
            finalId,
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
    const [habits, habitLogs, waterLogs, sleepLogs, settings] = await Promise.all([
      this.habits.list(),
      this.logs.list(),
      this.water.list(),
      this.sleep.list(),
      this.settings.load(),
    ]);
    return {
      app: 'rutiva',
      version: 3,
      exportedAt: now(),
      habits: habits.map((h) => ({ ...h, notificationIds: [] })),
      habitLogs,
      waterLogs,
      sleepLogs,
      // Los ids de notificaciones y el cronómetro son propios de este dispositivo.
      settings: { ...settings, bedtimeNotificationId: null, waterNotificationIds: [], activeTimer: null, sleepSession: null },
    };
  },

  async resetAll() {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.execAsync(
        'DELETE FROM habit_logs; DELETE FROM habits; DELETE FROM water_logs; DELETE FROM sleep_logs; DELETE FROM settings;',
      );
    });
  },
};
