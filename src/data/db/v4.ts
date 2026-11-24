import type { Db } from './types';

/**
 * Migración v4: pasa de columnas JSON a un esquema relacional.
 *
 *   categories ──< habits ──< habit_schedules   (programación + meta, versionadas)
 *                    │   ├──< habit_pauses      (pausas y archivados)
 *                    │   ├──< habit_logs        (cumplimiento por fecha)
 *                    │   ├──< alarms ──< scheduled_notifications
 *                    │   └──< timed_sessions    (cronómetros)
 *   alarms (bedtime / water) ──< scheduled_notifications
 *   timed_sessions (sleep) ──< sleep_logs.session_id
 *   water_logs · user_settings
 *
 * La definición del hábito (habits) está separada de su cumplimiento por
 * fecha (habit_logs). Los hábitos NO se duplican cada día: la app calcula qué
 * toca cada fecha con habit_schedules y habit_pauses.
 */
export const SCHEMA_V4 = `
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO categories (id, name, icon, color, sort_order) VALUES
  ('health', 'Salud', 'heart', '#EF4444', 0),
  ('exercise', 'Ejercicio', 'workout', '#F97316', 1),
  ('hydration', 'Hidratación', 'water', '#06B6D4', 2),
  ('study', 'Estudio', 'book', '#3B82F6', 3),
  ('work', 'Trabajo', 'work', '#64748B', 4),
  ('food', 'Alimentación', 'salad', '#84CC16', 5),
  ('sleep', 'Sueño', 'bed', '#7C6CF2', 6),
  ('productivity', 'Productividad', 'focus', '#5B5BD6', 7),
  ('wellbeing', 'Bienestar', 'meditate', '#A855F7', 8),
  ('custom', 'Personalizado', 'sparkles', '#14B8A6', 9);

CREATE TABLE habits_v4 (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  category_id TEXT NOT NULL DEFAULT 'custom' REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  tracking_type TEXT NOT NULL CHECK (tracking_type IN ('check', 'quantity', 'duration', 'count')),
  unit TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT CHECK (end_date IS NULL OR end_date >= start_date),
  suggested_time TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Programación y meta. Cada edición cierra la versión anterior (valid_until)
-- para que los días pasados se evalúen con la regla que tenían.
CREATE TABLE habit_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'interval')),
  days_mask INTEGER NOT NULL CHECK (days_mask BETWEEN 1 AND 127), -- bit 0 = domingo … bit 6 = sábado
  interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  target REAL NOT NULL CHECK (target > 0),
  created_at TEXT NOT NULL,
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE UNIQUE INDEX ux_habit_schedules_from ON habit_schedules(habit_id, valid_from);
CREATE UNIQUE INDEX ux_habit_schedules_current ON habit_schedules(habit_id) WHERE valid_until IS NULL;

CREATE TABLE habit_pauses (
  id TEXT PRIMARY KEY NOT NULL,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT,
  reason TEXT NOT NULL DEFAULT 'pause' CHECK (reason IN ('pause', 'archive')),
  created_at TEXT NOT NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_habit_pauses_habit ON habit_pauses(habit_id, start_date);
CREATE UNIQUE INDEX ux_habit_pauses_open ON habit_pauses(habit_id) WHERE end_date IS NULL;

CREATE TABLE habit_logs_v4 (
  id TEXT PRIMARY KEY NOT NULL,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0 CHECK (value >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (habit_id, date)
);

-- Recordatorios. 'habit': uno por hora y hábito. 'water' y 'bedtime': únicos.
CREATE TABLE alarms (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('habit', 'water', 'bedtime')),
  habit_id TEXT REFERENCES habits(id) ON DELETE CASCADE,
  time TEXT,
  window_start TEXT,
  window_end TEXT,
  every_minutes INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'habit') = (habit_id IS NOT NULL)),
  CHECK (kind = 'water' OR time IS NOT NULL),
  CHECK (kind <> 'water' OR (window_start IS NOT NULL AND window_end IS NOT NULL AND every_minutes >= 15))
);
CREATE UNIQUE INDEX ux_alarms_habit_time ON alarms(habit_id, time) WHERE kind = 'habit';
CREATE UNIQUE INDEX ux_alarms_singleton ON alarms(kind) WHERE kind IN ('water', 'bedtime');

-- Avisos que el sistema operativo tiene programados en ESTE dispositivo.
CREATE TABLE scheduled_notifications (
  notification_id TEXT PRIMARY KEY NOT NULL,
  alarm_id TEXT NOT NULL REFERENCES alarms(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_scheduled_notifications_alarm ON scheduled_notifications(alarm_id);

-- Cronómetros de hábitos y sesiones de sueño ("Voy a dormir").
CREATE TABLE timed_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('habit', 'sleep')),
  habit_id TEXT REFERENCES habits(id) ON DELETE CASCADE,
  log_date TEXT,
  started_at TEXT NOT NULL,
  running_since TEXT,
  accumulated_ms INTEGER NOT NULL DEFAULT 0 CHECK (accumulated_ms >= 0),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'finished', 'discarded')),
  ended_at TEXT,
  result_minutes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'habit') = (habit_id IS NOT NULL)),
  CHECK (kind = 'sleep' OR log_date IS NOT NULL)
);
-- Solo puede haber una sesión activa de cada tipo.
CREATE UNIQUE INDEX ux_timed_sessions_active ON timed_sessions(kind) WHERE status IN ('running', 'paused');
CREATE INDEX idx_timed_sessions_habit ON timed_sessions(habit_id, log_date);
`;

interface OldHabit {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string;
  color: string;
  tracking_type: string;
  target: number;
  unit: string | null;
  frequency: string;
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

const CATEGORY_IDS = new Set(['health', 'exercise', 'hydration', 'study', 'work', 'food', 'sleep', 'productivity', 'wellbeing', 'custom']);

function parse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function daysToMask(days: number[]): number {
  const mask = days.reduce((m, d) => m | (1 << d), 0);
  return mask || 127;
}

/** yyyy-MM-dd + 1 día, sin depender de la zona horaria. */
export function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

/** Filas de habit_schedules a partir de la regla actual y el historial. */
export function scheduleRows(
  habitId: string,
  startDate: string,
  current: { frequency: string; daysOfWeek: number[]; intervalDays: number; target: number },
  history: { until: string; frequency: string; daysOfWeek: number[]; intervalDays: number; target: number }[],
) {
  const rows: { id: string; validFrom: string; validUntil: string | null; frequency: string; mask: number; interval: number; target: number }[] = [];
  let from = startDate;
  for (const r of [...history].sort((a, b) => (a.until < b.until ? -1 : 1))) {
    if (r.until < from) continue; // reglas anteriores al inicio: irrelevantes
    rows.push({ id: `${habitId}:${from}`, validFrom: from, validUntil: r.until, frequency: r.frequency, mask: daysToMask(r.daysOfWeek), interval: Math.max(1, r.intervalDays), target: r.target });
    from = nextDay(r.until);
  }
  rows.push({
    id: `${habitId}:${from}`,
    validFrom: from,
    validUntil: null,
    frequency: current.frequency,
    mask: daysToMask(current.daysOfWeek),
    interval: Math.max(1, current.intervalDays),
    target: current.target,
  });
  return rows;
}

async function setting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row ? parse<T>(row.value, fallback) : fallback;
}

export async function migrateToV4(db: Db): Promise<void> {
  await db.execAsync(SCHEMA_V4);
  const ts = new Date().toISOString();

  // ---------- Hábitos y sus tablas hijas ----------
  const habits = await db.getAllAsync<OldHabit>('SELECT * FROM habits');
  for (const h of habits) {
    await db.runAsync(
      `INSERT INTO habits_v4 (id, name, description, category_id, icon, color, tracking_type, unit, start_date, end_date,
         suggested_time, archived, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      h.id,
      h.name.trim() || 'Hábito',
      h.description,
      CATEGORY_IDS.has(h.category) ? h.category : 'custom',
      h.icon,
      h.color,
      h.tracking_type,
      h.unit,
      h.start_date,
      h.end_date && h.end_date >= h.start_date ? h.end_date : null,
      h.suggested_time,
      h.archived ? 1 : 0,
      h.sort_order,
      h.created_at,
      h.updated_at,
      h.deleted_at,
    );

    const rows = scheduleRows(
      h.id,
      h.start_date,
      { frequency: h.frequency, daysOfWeek: parse(h.days_of_week, [0, 1, 2, 3, 4, 5, 6]), intervalDays: h.interval_days, target: h.target },
      parse(h.schedule_history, []),
    );
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO habit_schedules (id, habit_id, valid_from, valid_until, frequency, days_mask, interval_days, target, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id, h.id, r.validFrom, r.validUntil, r.frequency, r.mask, r.interval, r.target, ts,
      );
    }

    const pauses = parse<{ from: string; to: string | null; reason?: string }[]>(h.pauses, []).sort((a, b) => (a.from < b.from ? -1 : 1));
    for (let i = 0; i < pauses.length; i++) {
      const p = pauses[i];
      // Solo puede quedar abierta la última.
      const end = p.to ?? (i < pauses.length - 1 ? pauses[i + 1].from : null);
      await db.runAsync(
        'INSERT INTO habit_pauses (id, habit_id, start_date, end_date, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        `${h.id}:p${i}`, h.id, p.from, end === null ? null : end >= p.from ? end : p.from, p.reason === 'archive' ? 'archive' : 'pause', ts,
      );
    }

    const times = [...new Set(parse<string[]>(h.reminder_times, []))].sort();
    const ids = parse<string[]>(h.notification_ids, []);
    for (const time of times) {
      await db.runAsync(
        `INSERT INTO alarms (id, kind, habit_id, time, enabled, created_at, updated_at) VALUES (?, 'habit', ?, ?, 1, ?, ?)`,
        `${h.id}:${time}`, h.id, time, ts, ts,
      );
    }
    // Los ids antiguos no sabían a qué hora pertenecían: se asocian a la
    // primera alarma, así se cancelan al reprogramar en el siguiente arranque.
    if (times.length) {
      for (const id of ids) {
        await db.runAsync('INSERT OR IGNORE INTO scheduled_notifications (notification_id, alarm_id, created_at) VALUES (?, ?, ?)', id, `${h.id}:${times[0]}`, ts);
      }
    }
  }

  await db.execAsync(`
    INSERT INTO habit_logs_v4 (id, habit_id, date, value, created_at, updated_at, deleted_at)
      SELECT id, habit_id, date, MAX(count, 0), created_at, updated_at, deleted_at FROM habit_logs;
    DROP TABLE habit_logs;
    DROP TABLE habits;
    ALTER TABLE habits_v4 RENAME TO habits;
    ALTER TABLE habit_logs_v4 RENAME TO habit_logs;
    CREATE INDEX idx_habits_category ON habits(category_id);
    CREATE INDEX idx_habit_logs_date ON habit_logs(date);
  `);

  // ---------- Alarmas de agua y de hora de dormir (antes en ajustes) ----------
  await db.runAsync(
    `INSERT INTO alarms (id, kind, time, enabled, created_at, updated_at) VALUES ('bedtime', 'bedtime', ?, ?, ?, ?)`,
    await setting(db, 'bedtimeReminderTime', '22:30'),
    (await setting(db, 'bedtimeReminderEnabled', false)) ? 1 : 0,
    ts,
    ts,
  );
  await db.runAsync(
    `INSERT INTO alarms (id, kind, window_start, window_end, every_minutes, enabled, created_at, updated_at)
     VALUES ('water', 'water', ?, ?, ?, ?, ?, ?)`,
    await setting(db, 'waterReminderStart', '09:00'),
    await setting(db, 'waterReminderEnd', '21:00'),
    Math.max(15, await setting(db, 'waterReminderEveryMinutes', 120)),
    (await setting(db, 'waterReminderEnabled', false)) ? 1 : 0,
    ts,
    ts,
  );
  const bedtimeId = await setting<string | null>(db, 'bedtimeNotificationId', null);
  if (bedtimeId) {
    await db.runAsync('INSERT OR IGNORE INTO scheduled_notifications (notification_id, alarm_id, created_at) VALUES (?, ?, ?)', bedtimeId, 'bedtime', ts);
  }
  for (const id of await setting<string[]>(db, 'waterNotificationIds', [])) {
    await db.runAsync('INSERT OR IGNORE INTO scheduled_notifications (notification_id, alarm_id, created_at) VALUES (?, ?, ?)', id, 'water', ts);
  }

  // ---------- Sesiones activas (antes en ajustes) ----------
  const timer = await setting<{ habitId: string; date: string; runningSince: string | null; accumulatedMs: number } | null>(db, 'activeTimer', null);
  const habitExists = timer ? await db.getFirstAsync('SELECT id FROM habits WHERE id = ?', timer.habitId) : null;
  if (timer && habitExists) {
    await db.runAsync(
      `INSERT INTO timed_sessions (id, kind, habit_id, log_date, started_at, running_since, accumulated_ms, status, created_at, updated_at)
       VALUES ('migrated-timer', 'habit', ?, ?, ?, ?, ?, ?, ?, ?)`,
      timer.habitId, timer.date, timer.runningSince ?? ts, timer.runningSince, Math.max(0, Math.round(timer.accumulatedMs)),
      timer.runningSince ? 'running' : 'paused', ts, ts,
    );
  }
  const sleep = await setting<{ startedAt: string } | null>(db, 'sleepSession', null);
  if (sleep) {
    await db.runAsync(
      `INSERT INTO timed_sessions (id, kind, started_at, running_since, status, created_at, updated_at)
       VALUES ('migrated-sleep', 'sleep', ?, ?, 'running', ?, ?)`,
      sleep.startedAt, sleep.startedAt, ts, ts,
    );
  }

  await db.execAsync(`
    DELETE FROM settings WHERE key IN ('bedtimeReminderEnabled', 'bedtimeReminderTime', 'bedtimeNotificationId',
      'waterReminderEnabled', 'waterReminderStart', 'waterReminderEnd', 'waterReminderEveryMinutes', 'waterNotificationIds',
      'activeTimer', 'sleepSession');
    ALTER TABLE settings RENAME TO user_settings;
    ALTER TABLE sleep_logs ADD COLUMN session_id TEXT REFERENCES timed_sessions(id) ON DELETE SET NULL;
  `);

  // Quien ya tenía hábitos no necesita la bienvenida inicial.
  const any = await db.getFirstAsync('SELECT id FROM habits WHERE deleted_at IS NULL LIMIT 1');
  if (any) await db.runAsync(`INSERT OR REPLACE INTO user_settings (key, value) VALUES ('onboarded', 'true')`);
}
