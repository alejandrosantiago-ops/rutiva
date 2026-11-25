import { sleepDuration } from '@/domain/sleep';
import type {
  AppSettings,
  Habit,
  HabitCategory,
  HabitLog,
  HabitRule,
  PausePeriod,
  SessionKind,
  SleepLog,
  TimedSession,
  WakeAlarm,
  WaterLog,
  Weekday,
} from '@/domain/types';
import type { Db, SqlValue } from '../db/types';
import { daysToMask, scheduleRows } from '../db/v4';
import type { BackupPayload, Repositories } from './types';
import { SYNCED_SETTINGS, type SyncChanges } from '../sync/engine';

const SETTINGS_STAMP = '__settingsUpdatedAt';
const SYNCED_SETTING_KEYS = new Set<string>(SYNCED_SETTINGS);

/**
 * Implementación SQLite de los repositorios sobre el esquema relacional (v4).
 * Es una factory: recibe la conexión y el generador de ids, así se ejecuta
 * igual en la app (expo-sqlite) y en las pruebas (node:sqlite).
 */
export interface SqliteDeps {
  getDb: () => Promise<Db>;
  uuid: () => string;
  now?: () => string;
}

// ---------- Filas ----------

interface HabitRow {
  id: string;
  name: string;
  description: string | null;
  category_id: HabitCategory;
  icon: string;
  color: string;
  tracking_type: Habit['trackingType'];
  unit: string | null;
  start_date: string;
  end_date: string | null;
  suggested_time: string | null;
  archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface ScheduleRow {
  habit_id: string;
  valid_from: string;
  valid_until: string | null;
  frequency: Habit['frequency'];
  days_mask: number;
  interval_days: number;
  target: number;
}
interface PauseRow {
  habit_id: string;
  start_date: string;
  end_date: string | null;
  reason: 'pause' | 'archive';
}
interface AlarmRow {
  id: string;
  kind: 'habit' | 'water' | 'bedtime';
  habit_id: string | null;
  time: string | null;
  window_start: string | null;
  window_end: string | null;
  every_minutes: number | null;
  enabled: number;
  message: string | null;
  label: string | null;
  days_mask: number | null;
  sound: string | null;
  snooze_minutes: number | null;
  mode: string | null;
}
interface LogRow {
  id: string;
  habit_id: string;
  date: string;
  value: number;
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
interface SessionRow {
  id: string;
  kind: SessionKind;
  habit_id: string | null;
  log_date: string | null;
  started_at: string;
  running_since: string | null;
  accumulated_ms: number;
  status: TimedSession['status'];
  ended_at: string | null;
  result_minutes: number | null;
}

const maskToDays = (mask: number): Weekday[] => [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d)) as Weekday[];

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const toLog = (r: LogRow): HabitLog => ({
  id: r.id,
  habitId: r.habit_id,
  date: r.date,
  value: r.value,
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

const toSession = (r: SessionRow): TimedSession => ({
  id: r.id,
  kind: r.kind,
  habitId: r.habit_id,
  date: r.log_date,
  startedAt: r.started_at,
  runningSince: r.running_since,
  accumulatedMs: r.accumulated_ms,
  status: r.status,
  endedAt: r.ended_at,
  resultMinutes: r.result_minutes,
});

/** Claves de ajustes que viven en la tabla `alarms` y no en `user_settings`. */
const ALARM_KEYS = new Set<keyof AppSettings>([
  'bedtimeReminderEnabled',
  'bedtimeReminderTime',
  'bedtimeNotificationId',
  'waterReminderEnabled',
  'waterReminderStart',
  'waterReminderEnd',
  'waterReminderEveryMinutes',
  'waterNotificationIds',
]);

export function createSqliteRepositories({ getDb, uuid, now = () => new Date().toISOString() }: SqliteDeps): Repositories {
  // ---------- Ensamblado de hábitos (definición + tablas hijas) ----------

  async function loadHabits(db: Db, where = 'h.deleted_at IS NULL', ...params: SqlValue[]): Promise<Habit[]> {
    const rows = await db.getAllAsync<HabitRow>(`SELECT h.* FROM habits h WHERE ${where} ORDER BY h.sort_order, h.created_at`, ...params);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const inList = ids.map(() => '?').join(',');
    const [schedules, pauses, alarms, notifications] = await Promise.all([
      db.getAllAsync<ScheduleRow>(`SELECT * FROM habit_schedules WHERE habit_id IN (${inList}) ORDER BY valid_from`, ...ids),
      db.getAllAsync<PauseRow>(`SELECT * FROM habit_pauses WHERE habit_id IN (${inList}) ORDER BY start_date`, ...ids),
      db.getAllAsync<AlarmRow>(`SELECT * FROM alarms WHERE kind = 'habit' AND habit_id IN (${inList}) ORDER BY time`, ...ids),
      db.getAllAsync<{ notification_id: string; habit_id: string }>(
        `SELECT n.notification_id, a.habit_id FROM scheduled_notifications n JOIN alarms a ON a.id = n.alarm_id
         WHERE a.kind = 'habit' AND a.habit_id IN (${inList}) ORDER BY n.created_at, n.notification_id`,
        ...ids,
      ),
    ]);
    const by = <T extends { habit_id: string | null }>(list: T[]) => {
      const m = new Map<string, T[]>();
      for (const x of list) if (x.habit_id) (m.get(x.habit_id) ?? m.set(x.habit_id, []).get(x.habit_id)!).push(x);
      return m;
    };
    const sByHabit = by(schedules);
    const pByHabit = by(pauses);
    const aByHabit = by(alarms);
    const nByHabit = by(notifications);

    return rows.map((r) => {
      const sch = sByHabit.get(r.id) ?? [];
      const current = sch.find((s) => s.valid_until === null) ?? sch[sch.length - 1];
      const history: HabitRule[] = sch
        .filter((s) => s.valid_until !== null && s !== current)
        .map((s) => ({ until: s.valid_until!, frequency: s.frequency, daysOfWeek: maskToDays(s.days_mask), intervalDays: s.interval_days, target: s.target }));
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category_id,
        icon: r.icon,
        color: r.color,
        trackingType: r.tracking_type,
        target: current?.target ?? 1,
        unit: r.unit,
        frequency: current?.frequency ?? 'daily',
        daysOfWeek: current ? maskToDays(current.days_mask) : [0, 1, 2, 3, 4, 5, 6],
        intervalDays: current?.interval_days ?? 1,
        startDate: r.start_date,
        endDate: r.end_date,
        suggestedTime: r.suggested_time,
        reminderTimes: (aByHabit.get(r.id) ?? []).map((a) => a.time!),
        remindersEnabled: (aByHabit.get(r.id) ?? []).every((a) => a.enabled === 1),
        reminderMessages: Object.fromEntries(
          (aByHabit.get(r.id) ?? []).filter((a) => a.message).map((a) => [a.time!, a.message!]),
        ),
        notificationIds: (nByHabit.get(r.id) ?? []).map((n) => n.notification_id),
        pauses: (pByHabit.get(r.id) ?? []).map(
          (p): PausePeriod => (p.reason === 'archive' ? { from: p.start_date, to: p.end_date, reason: 'archive' } : { from: p.start_date, to: p.end_date }),
        ),
        scheduleHistory: history,
        archived: r.archived === 1,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        deletedAt: r.deleted_at,
      };
    });
  }

  async function loadHabit(db: Db, id: string): Promise<Habit> {
    const [habit] = await loadHabits(db, 'h.id = ?', id);
    if (!habit) throw new Error('Hábito no encontrado');
    return habit;
  }

  /** Inserta la fila de definición del hábito conservando id y fechas. */
  async function insertHabitRow(db: Db, h: Habit) {
    await db.runAsync(
      `INSERT INTO habits (id, name, description, category_id, icon, color, tracking_type, unit, start_date, end_date,
         suggested_time, archived, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      h.id, h.name, h.description, h.category, h.icon, h.color, h.trackingType, h.unit, h.startDate, h.endDate,
      h.suggestedTime, h.archived ? 1 : 0, h.sortOrder, h.createdAt, h.updatedAt, h.deletedAt,
    );
  }

  const DELETE_ALL_USER_DATA = `
    DELETE FROM scheduled_notifications;
    UPDATE sleep_logs SET session_id = NULL;
    DELETE FROM timed_sessions;
    DELETE FROM alarms;
    DELETE FROM habit_logs;
    DELETE FROM habit_schedules;
    DELETE FROM habit_pauses;
    DELETE FROM habits;
    DELETE FROM water_logs;
    DELETE FROM sleep_logs;
    DELETE FROM user_settings;
  `;

  async function writeSchedules(db: Db, h: Habit, ts: string) {
    await db.runAsync('DELETE FROM habit_schedules WHERE habit_id = ?', h.id);
    for (const r of scheduleRows(h.id, h.startDate, h, h.scheduleHistory)) {
      await db.runAsync(
        `INSERT INTO habit_schedules (id, habit_id, valid_from, valid_until, frequency, days_mask, interval_days, target, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uuid(), h.id, r.validFrom, r.validUntil, r.frequency, r.mask, r.interval, r.target, ts,
      );
    }
  }

  async function writePauses(db: Db, h: Habit, ts: string) {
    await db.runAsync('DELETE FROM habit_pauses WHERE habit_id = ?', h.id);
    for (const p of h.pauses) {
      await db.runAsync(
        'INSERT INTO habit_pauses (id, habit_id, start_date, end_date, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        uuid(), h.id, p.from, p.to, p.reason === 'archive' ? 'archive' : 'pause', ts,
      );
    }
  }

  /**
   * Sincroniza las alarmas por hora: conserva las que siguen (y sus avisos),
   * borra las quitadas y actualiza mensaje y activación.
   */
  async function writeAlarms(db: Db, h: Habit, ts: string) {
    const existing = await db.getAllAsync<AlarmRow>(`SELECT * FROM alarms WHERE kind = 'habit' AND habit_id = ?`, h.id);
    const wanted = new Set(h.reminderTimes);
    const enabled = h.remindersEnabled === false ? 0 : 1;
    const message = (time: string) => h.reminderMessages?.[time]?.trim() || null;
    for (const a of existing) {
      if (!wanted.has(a.time!)) await db.runAsync('DELETE FROM alarms WHERE id = ?', a.id);
      else await db.runAsync('UPDATE alarms SET enabled = ?, message = ?, updated_at = ? WHERE id = ?', enabled, message(a.time!), ts, a.id);
    }
    const have = new Set(existing.map((a) => a.time));
    for (const time of wanted) {
      if (have.has(time)) continue;
      await db.runAsync(
        `INSERT INTO alarms (id, kind, habit_id, time, enabled, message, created_at, updated_at) VALUES (?, 'habit', ?, ?, ?, ?, ?, ?)`,
        uuid(), h.id, time, enabled, message(time), ts, ts,
      );
    }
  }

  const SCALARS: Partial<Record<keyof Habit, [string, (v: unknown) => SqlValue]>> = {
    name: ['name', (v) => v as string],
    description: ['description', (v) => v as string | null],
    category: ['category_id', (v) => v as string],
    icon: ['icon', (v) => v as string],
    color: ['color', (v) => v as string],
    trackingType: ['tracking_type', (v) => v as string],
    unit: ['unit', (v) => v as string | null],
    startDate: ['start_date', (v) => v as string],
    endDate: ['end_date', (v) => v as string | null],
    suggestedTime: ['suggested_time', (v) => v as string | null],
    archived: ['archived', (v) => (v ? 1 : 0)],
    sortOrder: ['sort_order', (v) => v as number],
    deletedAt: ['deleted_at', (v) => v as string | null],
  };
  const SCHEDULE_KEYS: (keyof Habit)[] = ['frequency', 'daysOfWeek', 'intervalDays', 'target', 'scheduleHistory', 'startDate'];

  // ---------- Alarmas únicas (agua y hora de dormir) ----------

  async function singleton(db: Db, kind: 'water' | 'bedtime'): Promise<AlarmRow> {
    const row = await db.getFirstAsync<AlarmRow>('SELECT * FROM alarms WHERE id = ?', kind);
    if (row) return row;
    const ts = now();
    if (kind === 'bedtime') {
      await db.runAsync(`INSERT INTO alarms (id, kind, time, enabled, created_at, updated_at) VALUES ('bedtime', 'bedtime', '22:30', 0, ?, ?)`, ts, ts);
    } else {
      await db.runAsync(
        `INSERT INTO alarms (id, kind, window_start, window_end, every_minutes, enabled, created_at, updated_at)
         VALUES ('water', 'water', '09:00', '21:00', 120, 0, ?, ?)`,
        ts,
        ts,
      );
    }
    return (await db.getFirstAsync<AlarmRow>('SELECT * FROM alarms WHERE id = ?', kind))!;
  }

  async function replaceNotifications(db: Db, alarmId: string, ids: string[]) {
    await db.runAsync('DELETE FROM scheduled_notifications WHERE alarm_id = ?', alarmId);
    const ts = now();
    for (const id of ids) {
      await db.runAsync('INSERT OR REPLACE INTO scheduled_notifications (notification_id, alarm_id, created_at) VALUES (?, ?, ?)', id, alarmId, ts);
    }
  }

  async function notificationIds(db: Db, alarmId: string) {
    const rows = await db.getAllAsync<{ notification_id: string }>(
      'SELECT notification_id FROM scheduled_notifications WHERE alarm_id = ? ORDER BY created_at, notification_id',
      alarmId,
    );
    return rows.map((r) => r.notification_id);
  }

  async function toWake(db: Db, a: AlarmRow): Promise<WakeAlarm> {
    return {
      id: a.id,
      label: a.label ?? 'Despertador',
      time: a.time!,
      daysOfWeek: maskToDays(a.days_mask ?? 127),
      enabled: a.enabled === 1,
      sound: (a.sound ?? 'classic') as WakeAlarm['sound'],
      snoozeMinutes: a.snooze_minutes ?? 10,
      mode: (a.mode ?? 'app') as WakeAlarm['mode'],
      notificationIds: await notificationIds(db, a.id),
    };
  }

  // ---------- Sincronización (lado local) ----------

  /** Escribe un hábito recibido conservando su updated_at (no genera un cambio nuevo). */
  async function upsertHabit(db: Db, h: Habit) {
    const ts = h.updatedAt;
    const exists = await db.getFirstAsync('SELECT id FROM habits WHERE id = ?', h.id);
    if (!exists) {
      await insertHabitRow(db, h);
    } else {
      await db.runAsync(
        `UPDATE habits SET name = ?, description = ?, category_id = ?, icon = ?, color = ?, tracking_type = ?, unit = ?, start_date = ?,
           end_date = ?, suggested_time = ?, archived = ?, sort_order = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        h.name, h.description, h.category, h.icon, h.color, h.trackingType, h.unit, h.startDate, h.endDate, h.suggestedTime,
        h.archived ? 1 : 0, h.sortOrder, h.updatedAt, h.deletedAt, h.id,
      );
    }
    await writeSchedules(db, h, ts);
    await writePauses(db, h, ts);
    await writeAlarms(db, { ...h, remindersEnabled: h.remindersEnabled ?? true, reminderMessages: h.reminderMessages ?? {} }, ts);
  }

  const syncSource = {
    async changesSince(since: string | null): Promise<SyncChanges> {
      const db = await getDb();
      const after = since ?? '';
      const habits = await loadHabits(db, 'h.updated_at > ?', after);
      const logs = await db.getAllAsync<LogRow>('SELECT * FROM habit_logs WHERE updated_at > ?', after);
      const water = await db.getAllAsync<WaterRow>('SELECT * FROM water_logs WHERE updated_at > ?', after);
      const sleep = await db.getAllAsync<SleepRow>('SELECT * FROM sleep_logs WHERE updated_at > ?', after);
      const stampRow = await db.getFirstAsync<{ value: string }>('SELECT value FROM user_settings WHERE key = ?', SETTINGS_STAMP);
      const stamp = stampRow ? parseJson<string>(stampRow.value, '') : '';
      let settings: SyncChanges['settings'] = null;
      if (stamp && stamp > after) {
        const all = await repos.settings.load();
        const data: Record<string, unknown> = {};
        for (const k of SYNCED_SETTINGS) if (all[k] !== undefined) data[k] = all[k];
        settings = { data, updatedAt: stamp };
      }
      return {
        habits: habits.map((h) => ({ ...h, notificationIds: [] })),
        logs: logs.map(toLog),
        water: water.map(toWater),
        sleep: sleep.map(toSleep),
        settings,
      };
    },

    async apply(c: SyncChanges): Promise<number> {
      const db = await getDb();
      let applied = 0;
      await db.withTransactionAsync(async () => {
        for (const h of c.habits) {
          const local = await db.getFirstAsync<{ updated_at: string }>('SELECT updated_at FROM habits WHERE id = ?', h.id);
          if (local && local.updated_at >= h.updatedAt) continue;
          await upsertHabit(db, h);
          applied++;
        }
        for (const l of c.logs) {
          if (!(await db.getFirstAsync('SELECT id FROM habits WHERE id = ?', l.habitId))) continue;
          const local = await db.getFirstAsync<LogRow>('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?', l.habitId, l.date);
          if (local && local.updated_at >= l.updatedAt) continue;
          if (local) {
            await db.runAsync('UPDATE habit_logs SET value = ?, updated_at = ?, deleted_at = ? WHERE id = ?', l.value, l.updatedAt, l.deletedAt, local.id);
          } else {
            await db.runAsync(
              'INSERT INTO habit_logs (id, habit_id, date, value, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              l.id, l.habitId, l.date, l.value, l.createdAt, l.updatedAt, l.deletedAt,
            );
          }
          applied++;
        }
        for (const w of c.water) {
          const local = await db.getFirstAsync<WaterRow>('SELECT * FROM water_logs WHERE id = ?', w.id);
          if (local && local.updated_at >= w.updatedAt) continue;
          await db.runAsync(
            `INSERT INTO water_logs (id, date, amount_ml, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET date = excluded.date, amount_ml = excluded.amount_ml, updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at`,
            w.id, w.date, w.amountMl, w.createdAt, w.updatedAt, w.deletedAt,
          );
          applied++;
        }
        for (const n of c.sleep) {
          const local = await db.getFirstAsync<SleepRow>('SELECT * FROM sleep_logs WHERE id = ?', n.id);
          if (local && local.updated_at >= n.updatedAt) continue;
          let deletedAt = n.deletedAt;
          let updatedAt = n.updatedAt;
          if (!deletedAt) {
            // Una noche activa por fecha: si choca con otra local, gana la más reciente.
            const other = await db.getFirstAsync<SleepRow>(
              'SELECT * FROM sleep_logs WHERE date = ? AND id != ? AND deleted_at IS NULL',
              n.date,
              n.id,
            );
            if (other && other.updated_at > n.updatedAt) {
              deletedAt = other.updated_at;
              updatedAt = other.updated_at;
            } else if (other) {
              await db.runAsync('UPDATE sleep_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', n.updatedAt, n.updatedAt, other.id);
            }
          }
          await db.runAsync(
            `INSERT INTO sleep_logs (id, date, bedtime_at, wake_at, duration_minutes, latency_minutes, quality, notes, source, external_id,
               created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET date = excluded.date, bedtime_at = excluded.bedtime_at, wake_at = excluded.wake_at,
               duration_minutes = excluded.duration_minutes, latency_minutes = excluded.latency_minutes, quality = excluded.quality,
               notes = excluded.notes, source = excluded.source, external_id = excluded.external_id, updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at`,
            n.id, n.date, n.bedtimeAt, n.wakeAt, n.durationMinutes, n.latencyMinutes, n.quality, n.notes, n.source, n.externalId,
            n.createdAt, updatedAt, deletedAt,
          );
          applied++;
        }
        if (c.settings) {
          const stampRow = await db.getFirstAsync<{ value: string }>('SELECT value FROM user_settings WHERE key = ?', SETTINGS_STAMP);
          const stamp = stampRow ? parseJson<string>(stampRow.value, '') : '';
          if (c.settings.updatedAt > stamp) {
            for (const [key, value] of Object.entries(c.settings.data)) {
              if (!SYNCED_SETTING_KEYS.has(key)) continue;
              await db.runAsync(
                'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
                key,
                JSON.stringify(value),
              );
            }
            await db.runAsync(
              'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
              SETTINGS_STAMP,
              JSON.stringify(c.settings.updatedAt),
            );
            applied++;
          }
        }
      });
      return applied;
    },
  };

  const repos: Repositories = {
    sync: syncSource,
    habits: {
      async list() {
        return loadHabits(await getDb());
      },

      async create(input) {
        const db = await getDb();
        const ts = now();
        const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM habits');
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
        await db.withTransactionAsync(async () => {
          await insertHabitRow(db, habit);
          await writeSchedules(db, habit, ts);
          await writeAlarms(db, habit, ts);
        });
        return loadHabit(db, habit.id);
      },

      async update(id, patch) {
        const db = await getDb();
        const ts = now();
        await db.withTransactionAsync(async () => {
          const current = await loadHabit(db, id);
          const next: Habit = { ...current, ...patch };
          const sets: string[] = [];
          const values: SqlValue[] = [];
          for (const key of Object.keys(patch) as (keyof Habit)[]) {
            const col = SCALARS[key];
            if (!col) continue;
            sets.push(`${col[0]} = ?`);
            values.push(col[1](next[key]));
          }
          sets.push('updated_at = ?');
          values.push(ts);
          await db.runAsync(`UPDATE habits SET ${sets.join(', ')} WHERE id = ?`, ...values, id);
          if (SCHEDULE_KEYS.some((k) => k in patch)) await writeSchedules(db, next, ts);
          if ('pauses' in patch) await writePauses(db, next, ts);
          if ('reminderTimes' in patch || 'remindersEnabled' in patch || 'reminderMessages' in patch) await writeAlarms(db, next, ts);
        });
        return loadHabit(db, id);
      },

      async setReminderNotifications(habitId, byTime) {
        const db = await getDb();
        await db.withTransactionAsync(async () => {
          const alarms = await db.getAllAsync<AlarmRow>(`SELECT * FROM alarms WHERE kind = 'habit' AND habit_id = ?`, habitId);
          for (const a of alarms) await replaceNotifications(db, a.id, byTime[a.time!] ?? []);
        });
        return loadHabit(db, habitId);
      },

      async remove(id) {
        const db = await getDb();
        const ts = now();
        await db.withTransactionAsync(async () => {
          await db.runAsync('UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, id);
          // Sus avisos ya se cancelaron en el dispositivo.
          await db.runAsync(
            `DELETE FROM scheduled_notifications WHERE alarm_id IN (SELECT id FROM alarms WHERE kind = 'habit' AND habit_id = ?)`,
            id,
          );
        });
      },

      async restore(id) {
        const db = await getDb();
        await db.runAsync('UPDATE habits SET deleted_at = NULL, updated_at = ? WHERE id = ?', now(), id);
        return loadHabit(db, id);
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
        const rows = await db.getAllAsync<LogRow>(
          `SELECT l.* FROM habit_logs l JOIN habits h ON h.id = l.habit_id
           WHERE l.deleted_at IS NULL AND l.value > 0 AND h.deleted_at IS NULL`,
        );
        return rows.map(toLog);
      },

      async setValue(habitId, date, value) {
        const db = await getDb();
        const ts = now();
        // Redondeo a 3 decimales para no arrastrar errores de coma flotante.
        const safe = Math.max(0, Math.round(value * 1000) / 1000);
        await db.runAsync(
          `INSERT INTO habit_logs (id, habit_id, date, value, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT (habit_id, date) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL`,
          uuid(), habitId, date, safe, ts, ts,
        );
        const row = await db.getFirstAsync<LogRow>('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?', habitId, date);
        return toLog(row!);
      },
    },

    water: {
      async list() {
        const db = await getDb();
        const rows = await db.getAllAsync<WaterRow>('SELECT * FROM water_logs WHERE deleted_at IS NULL ORDER BY created_at, id');
        return rows.map(toWater);
      },
      async add(date, amountMl) {
        const db = await getDb();
        const ts = now();
        const log: WaterLog = { id: uuid(), date, amountMl: Math.round(amountMl), createdAt: ts, updatedAt: ts, deletedAt: null };
        await db.runAsync(
          'INSERT INTO water_logs (id, date, amount_ml, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)',
          log.id, log.date, log.amountMl, ts, ts,
        );
        return log;
      },
      async remove(id) {
        const db = await getDb();
        const ts = now();
        await db.runAsync('UPDATE water_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, id);
      },
      async restore(id) {
        const db = await getDb();
        await db.runAsync('UPDATE water_logs SET deleted_at = NULL, updated_at = ? WHERE id = ?', now(), id);
        return toWater((await db.getFirstAsync<WaterRow>('SELECT * FROM water_logs WHERE id = ?', id))!);
      },
    },

    sleep: {
      async list() {
        const db = await getDb();
        const rows = await db.getAllAsync<SleepRow>('SELECT * FROM sleep_logs WHERE deleted_at IS NULL ORDER BY date DESC');
        return rows.map(toSleep);
      },

      async save(input, id, sessionId = null) {
        const db = await getDb();
        const ts = now();
        const duration = sleepDuration(input.bedtimeAt, input.wakeAt, input.latencyMinutes);
        const values: SqlValue[] = [
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
          // Una noche por fecha (índice único parcial): la anterior se reemplaza.
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
                 notes = ?, source = ?, external_id = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`,
              ...values, ts, finalId,
            );
          } else {
            await db.runAsync(
              `INSERT INTO sleep_logs (date, bedtime_at, wake_at, duration_minutes, latency_minutes, quality, notes, source, external_id,
                 id, session_id, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
              ...values, finalId, sessionId, ts, ts,
            );
          }
          result = toSleep((await db.getFirstAsync<SleepRow>('SELECT * FROM sleep_logs WHERE id = ?', finalId))!);
        });
        return result;
      },

      async remove(id) {
        const db = await getDb();
        const ts = now();
        await db.runAsync('UPDATE sleep_logs SET deleted_at = ?, updated_at = ? WHERE id = ?', ts, ts, id);
      },

      async restore(id) {
        const db = await getDb();
        const ts = now();
        let result!: SleepLog;
        await db.withTransactionAsync(async () => {
          const row = (await db.getFirstAsync<SleepRow>('SELECT * FROM sleep_logs WHERE id = ?', id))!;
          // Si mientras tanto se registró otra noche ese día, gana la restaurada.
          await db.runAsync('UPDATE sleep_logs SET deleted_at = ?, updated_at = ? WHERE date = ? AND id != ? AND deleted_at IS NULL', ts, ts, row.date, id);
          await db.runAsync('UPDATE sleep_logs SET deleted_at = NULL, updated_at = ? WHERE id = ?', ts, id);
          result = toSleep((await db.getFirstAsync<SleepRow>('SELECT * FROM sleep_logs WHERE id = ?', id))!);
        });
        return result;
      },
    },

    sessions: {
      async active(kind) {
        const db = await getDb();
        const row = await db.getFirstAsync<SessionRow>(`SELECT * FROM timed_sessions WHERE kind = ? AND status IN ('running', 'paused')`, kind);
        return row ? toSession(row) : null;
      },
      async start(kind, startedAt, habitId, date) {
        const db = await getDb();
        const ts = now();
        const id = uuid();
        await db.runAsync(
          `INSERT INTO timed_sessions (id, kind, habit_id, log_date, started_at, running_since, accumulated_ms, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'running', ?, ?)`,
          id, kind, habitId ?? null, date ?? null, startedAt, startedAt, ts, ts,
        );
        return toSession((await db.getFirstAsync<SessionRow>('SELECT * FROM timed_sessions WHERE id = ?', id))!);
      },
      async save(s) {
        const db = await getDb();
        await db.runAsync(
          `UPDATE timed_sessions SET running_since = ?, accumulated_ms = ?, status = ?, ended_at = ?, result_minutes = ?, updated_at = ? WHERE id = ?`,
          s.runningSince, Math.round(s.accumulatedMs), s.status, s.endedAt, s.resultMinutes, now(), s.id,
        );
        return toSession((await db.getFirstAsync<SessionRow>('SELECT * FROM timed_sessions WHERE id = ?', s.id))!);
      },
      async history(kind, limit = 50) {
        const db = await getDb();
        const rows = await db.getAllAsync<SessionRow>('SELECT * FROM timed_sessions WHERE kind = ? ORDER BY started_at DESC LIMIT ?', kind, limit);
        return rows.map(toSession);
      },
    },

    wakeAlarms: {
      async list() {
        const db = await getDb();
        const rows = await db.getAllAsync<AlarmRow>(`SELECT * FROM alarms WHERE kind = 'wake' ORDER BY time, created_at`);
        return Promise.all(rows.map((a) => toWake(db, a)));
      },
      async save(input, id) {
        const db = await getDb();
        const ts = now();
        const values: SqlValue[] = [
          input.label.trim() || 'Despertador',
          input.time,
          daysToMask(input.daysOfWeek),
          input.enabled ? 1 : 0,
          input.sound,
          Math.min(60, Math.max(1, Math.round(input.snoozeMinutes))),
          input.mode,
        ];
        const finalId = id ?? uuid();
        if (id) {
          await db.runAsync(
            `UPDATE alarms SET label = ?, time = ?, days_mask = ?, enabled = ?, sound = ?, snooze_minutes = ?, mode = ?, updated_at = ?
             WHERE id = ? AND kind = 'wake'`,
            ...values, ts, id,
          );
        } else {
          await db.runAsync(
            `INSERT INTO alarms (label, time, days_mask, enabled, sound, snooze_minutes, mode, id, kind, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'wake', ?, ?)`,
            ...values, finalId, ts, ts,
          );
        }
        return toWake(db, (await db.getFirstAsync<AlarmRow>('SELECT * FROM alarms WHERE id = ?', finalId))!);
      },
      async remove(id) {
        const db = await getDb();
        await db.runAsync(`DELETE FROM alarms WHERE id = ? AND kind = 'wake'`, id);
      },
      async setNotifications(id, ids) {
        const db = await getDb();
        await replaceNotifications(db, id, ids);
        return toWake(db, (await db.getFirstAsync<AlarmRow>('SELECT * FROM alarms WHERE id = ?', id))!);
      },
    },

    settings: {
      async load() {
        const db = await getDb();
        const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM user_settings');
        const out: Record<string, unknown> = {};
        for (const r of rows) {
          if (r.key.startsWith('__') || ALARM_KEYS.has(r.key as keyof AppSettings)) continue;
          out[r.key] = parseJson(r.value, undefined);
        }
        const bedtime = await singleton(db, 'bedtime');
        const water = await singleton(db, 'water');
        const [bedtimeIds, waterIds] = await Promise.all([notificationIds(db, 'bedtime'), notificationIds(db, 'water')]);
        return {
          ...(out as Partial<AppSettings>),
          bedtimeReminderEnabled: bedtime.enabled === 1,
          bedtimeReminderTime: bedtime.time!,
          bedtimeNotificationId: bedtimeIds[0] ?? null,
          waterReminderEnabled: water.enabled === 1,
          waterReminderStart: water.window_start!,
          waterReminderEnd: water.window_end!,
          waterReminderEveryMinutes: water.every_minutes!,
          waterNotificationIds: waterIds,
        };
      },

      async save(key, value) {
        const db = await getDb();
        if (!ALARM_KEYS.has(key)) {
          await db.runAsync(
            'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
            key,
            JSON.stringify(value),
          );
          // Los ajustes que se sincronizan llevan una marca de tiempo común.
          if (SYNCED_SETTING_KEYS.has(key)) {
            await db.runAsync(
              'INSERT INTO user_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
              SETTINGS_STAMP,
              JSON.stringify(now()),
            );
          }
          return;
        }
        // Ajustes de recordatorios: viven en la tabla de alarmas.
        const ts = now();
        const isWater = key.startsWith('water');
        await singleton(db, isWater ? 'water' : 'bedtime');
        const alarmId = isWater ? 'water' : 'bedtime';
        const set = (col: string, v: SqlValue) => db.runAsync(`UPDATE alarms SET ${col} = ?, updated_at = ? WHERE id = ?`, v, ts, alarmId);
        switch (key) {
          case 'bedtimeReminderEnabled':
          case 'waterReminderEnabled':
            return void (await set('enabled', value ? 1 : 0));
          case 'bedtimeReminderTime':
            return void (await set('time', value as string));
          case 'waterReminderStart':
            return void (await set('window_start', value as string));
          case 'waterReminderEnd':
            return void (await set('window_end', value as string));
          case 'waterReminderEveryMinutes':
            return void (await set('every_minutes', Math.max(15, value as number)));
          case 'bedtimeNotificationId':
            return replaceNotifications(db, 'bedtime', value ? [value as string] : []);
          case 'waterNotificationIds':
            return replaceNotifications(db, 'water', value as string[]);
        }
      },
    },

    async exportAll(): Promise<BackupPayload> {
      const db = await getDb();
      const [habits, habitLogs, waterLogs, sleepLogs, settings, sessionRows, wakeAlarms] = await Promise.all([
        repos.habits.list(),
        repos.logs.list(),
        repos.water.list(),
        repos.sleep.list(),
        repos.settings.load(),
        db.getAllAsync<SessionRow>('SELECT * FROM timed_sessions ORDER BY started_at'),
        repos.wakeAlarms.list(),
      ]);
      return {
        app: 'rutiva',
        version: 5,
        exportedAt: now(),
        habits: habits.map((h) => ({ ...h, notificationIds: [] })),
        habitLogs,
        waterLogs,
        sleepLogs,
        timedSessions: sessionRows.map(toSession),
        wakeAlarms: wakeAlarms.map((a) => ({ ...a, notificationIds: [] })),
        // Los ids de notificaciones son propios de este dispositivo.
        settings: { ...settings, bedtimeNotificationId: null, waterNotificationIds: [] },
      };
    },

    async resetAll() {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        await db.execAsync(DELETE_ALL_USER_DATA);
      });
    },

    async importAll(b) {
      const db = await getDb();
      const ts = now();
      await db.withTransactionAsync(async () => {
        await db.execAsync(DELETE_ALL_USER_DATA);
        for (const h of b.habits) {
          await insertHabitRow(db, h);
          await writeSchedules(db, h, ts);
          await writePauses(db, h, ts);
          await writeAlarms(db, h, ts);
        }
        for (const l of b.habitLogs) {
          await db.runAsync(
            `INSERT INTO habit_logs (id, habit_id, date, value, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT (habit_id, date) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            l.id || uuid(), l.habitId, l.date, l.value, l.createdAt || ts, l.updatedAt || ts,
          );
        }
        for (const w of b.waterLogs) {
          await db.runAsync(
            'INSERT OR IGNORE INTO water_logs (id, date, amount_ml, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)',
            w.id || uuid(), w.date, w.amountMl, w.createdAt || ts, w.updatedAt || ts,
          );
        }
        // Una noche por fecha: si la copia trae dos, gana la más reciente.
        const nights = [...b.sleepLogs].sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1));
        for (const n of nights) {
          await db.runAsync(
            `INSERT OR IGNORE INTO sleep_logs (id, date, bedtime_at, wake_at, duration_minutes, latency_minutes, quality, notes, source,
               external_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            n.id || uuid(), n.date, n.bedtimeAt, n.wakeAt, n.durationMinutes, n.latencyMinutes, n.quality, n.notes, n.source,
            n.externalId, n.createdAt || ts, n.updatedAt || ts,
          );
        }
        for (const ses of b.timedSessions) {
          await db.runAsync(
            `INSERT OR IGNORE INTO timed_sessions (id, kind, habit_id, log_date, started_at, running_since, accumulated_ms, status, ended_at,
               result_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
            ses.id || uuid(), ses.kind, ses.habitId, ses.date, ses.startedAt, Math.max(0, Math.round(ses.accumulatedMs)), ses.status,
            ses.endedAt, ses.resultMinutes, ts, ts,
          );
        }
        for (const a of b.wakeAlarms) {
          await db.runAsync(
            `INSERT OR IGNORE INTO alarms (id, kind, label, time, days_mask, enabled, sound, snooze_minutes, mode, created_at, updated_at)
             VALUES (?, 'wake', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            a.id || uuid(), a.label || 'Despertador', a.time, daysToMask(a.daysOfWeek ?? []), a.enabled ? 1 : 0,
            ['classic', 'soft', 'digital', 'default'].includes(a.sound) ? a.sound : 'classic',
            Math.min(60, Math.max(1, a.snoozeMinutes || 10)), a.mode === 'system' ? 'system' : 'app', ts, ts,
          );
        }
        // Ajustes (los ids de notificaciones son de cada dispositivo y no se importan).
        for (const [key, value] of Object.entries(b.settings)) {
          if (key === 'bedtimeNotificationId' || key === 'waterNotificationIds' || value === undefined) continue;
          await repos.settings.save(key as keyof AppSettings, value as never);
        }
      });
    },
  };
  return repos;
}

