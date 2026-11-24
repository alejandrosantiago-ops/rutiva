/**
 * v5 — Alarmas de despertar y recordatorios personalizados.
 *
 * SQLite no permite cambiar un CHECK, así que se reconstruye `alarms` para
 * admitir el tipo 'wake' y añadir columnas:
 *  - message: texto personalizado de un recordatorio de hábito.
 *  - label, days_mask, sound, snooze_minutes, mode: datos del despertador.
 * `scheduled_notifications` apunta a `alarms` por nombre, así que sigue
 * enlazada tras renombrar la tabla nueva.
 */
export const MIGRATION_V5 = `
CREATE TABLE alarms_v5 (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('habit', 'water', 'bedtime', 'wake')),
  habit_id TEXT REFERENCES habits(id) ON DELETE CASCADE,
  time TEXT,
  window_start TEXT,
  window_end TEXT,
  every_minutes INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  message TEXT,
  label TEXT,
  days_mask INTEGER,
  sound TEXT,
  snooze_minutes INTEGER,
  mode TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'habit') = (habit_id IS NOT NULL)),
  CHECK (kind = 'water' OR time IS NOT NULL),
  CHECK (kind <> 'water' OR (window_start IS NOT NULL AND window_end IS NOT NULL AND every_minutes >= 15)),
  CHECK (kind <> 'wake' OR (days_mask BETWEEN 1 AND 127 AND snooze_minutes BETWEEN 1 AND 60 AND mode IN ('app', 'system')
    AND sound IN ('classic', 'soft', 'digital', 'default')))
);

INSERT INTO alarms_v5 (id, kind, habit_id, time, window_start, window_end, every_minutes, enabled, created_at, updated_at)
  SELECT id, kind, habit_id, time, window_start, window_end, every_minutes, enabled, created_at, updated_at FROM alarms;

DROP TABLE alarms;
ALTER TABLE alarms_v5 RENAME TO alarms;
CREATE UNIQUE INDEX ux_alarms_habit_time ON alarms(habit_id, time) WHERE kind = 'habit';
CREATE UNIQUE INDEX ux_alarms_singleton ON alarms(kind) WHERE kind IN ('water', 'bedtime');
CREATE INDEX idx_alarms_kind ON alarms(kind);
`;
