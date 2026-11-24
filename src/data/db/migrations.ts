/**
 * Migraciones versionadas con `PRAGMA user_version`.
 * Para cambiar el esquema añade una entrada nueva al final; nunca edites una existente.
 *
 * Convenciones pensadas para sincronizar en el futuro con Supabase/PostgreSQL:
 *  - ids UUID en texto (mapean a `uuid`),
 *  - fechas ISO-8601 en texto (mapean a `timestamptz` / `date`),
 *  - `updated_at` para resolver conflictos (last-write-wins),
 *  - `deleted_at` como borrado lógico para propagar eliminaciones.
 */
import type { Migration } from './types';
import { migrateToV4 } from './v4';
import { MIGRATION_V5 } from './v5';

export const MIGRATIONS: Migration[] = [
  // v1 — esquema inicial
  `
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'custom')),
    days_of_week TEXT NOT NULL,
    target_per_day INTEGER NOT NULL DEFAULT 1 CHECK (target_per_day >= 1),
    unit TEXT,
    reminder_enabled INTEGER NOT NULL DEFAULT 0,
    reminder_time TEXT,
    notification_ids TEXT NOT NULL DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (habit_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);

  CREATE TABLE IF NOT EXISTS sleep_logs (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    bedtime_at TEXT NOT NULL,
    wake_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    quality INTEGER NOT NULL DEFAULT 3 CHECK (quality BETWEEN 1 AND 5),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_logs_date ON sleep_logs(date) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,

  // v2 — categorías, tipos de seguimiento, intervalos, fin, pausas, varios
  // recordatorios e hidratación. SQLite no permite cambiar un CHECK, así que
  // se reconstruye `habits` copiando los datos (las claves foráneas se
  // desactivan fuera de la transacción en client.ts para no borrar registros).
  `
  CREATE TABLE habits_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom',
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    tracking_type TEXT NOT NULL DEFAULT 'check' CHECK (tracking_type IN ('check', 'quantity', 'duration', 'count')),
    target REAL NOT NULL DEFAULT 1 CHECK (target > 0),
    unit TEXT,
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'interval')),
    days_of_week TEXT NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
    start_date TEXT NOT NULL,
    end_date TEXT,
    suggested_time TEXT,
    reminder_times TEXT NOT NULL DEFAULT '[]',
    notification_ids TEXT NOT NULL DEFAULT '[]',
    pauses TEXT NOT NULL DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  INSERT INTO habits_v2 (id, name, description, category, icon, color, tracking_type, target, unit, frequency,
    days_of_week, interval_days, start_date, end_date, suggested_time, reminder_times, notification_ids, pauses,
    archived, sort_order, created_at, updated_at, deleted_at)
  SELECT id, name, description,
    CASE icon WHEN 'water' THEN 'hydration' WHEN 'workout' THEN 'exercise' WHEN 'walk' THEN 'exercise'
      WHEN 'book' THEN 'study' WHEN 'meditate' THEN 'wellbeing' ELSE 'custom' END,
    icon, color,
    CASE WHEN target_per_day > 1 THEN 'count' ELSE 'check' END,
    target_per_day,
    CASE WHEN target_per_day > 1 THEN unit ELSE NULL END,
    CASE frequency WHEN 'custom' THEN 'weekly' ELSE 'daily' END,
    days_of_week, 1, start_date, NULL, NULL,
    CASE WHEN reminder_enabled = 1 AND reminder_time IS NOT NULL THEN json_array(reminder_time) ELSE '[]' END,
    notification_ids, '[]', archived, sort_order, created_at, updated_at, deleted_at
  FROM habits;

  DROP TABLE habits;
  ALTER TABLE habits_v2 RENAME TO habits;

  CREATE TABLE IF NOT EXISTS water_logs (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    amount_ml INTEGER NOT NULL CHECK (amount_ml > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(date);
  `,

  // v3 — historial de programación, archivado como pausa (para no perder
  // días pasados) y origen/latencia de los registros de sueño.
  `
  ALTER TABLE habits ADD COLUMN schedule_history TEXT NOT NULL DEFAULT '[]';

  UPDATE habits
  SET pauses = json_insert(pauses, '$[#]', json_object('from', substr(updated_at, 1, 10), 'to', NULL, 'reason', 'archive'))
  WHERE archived = 1
    AND NOT EXISTS (SELECT 1 FROM json_each(habits.pauses) WHERE json_extract(value, '$.to') IS NULL);

  ALTER TABLE sleep_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
  ALTER TABLE sleep_logs ADD COLUMN latency_minutes INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sleep_logs ADD COLUMN external_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_logs_external ON sleep_logs(external_id) WHERE external_id IS NOT NULL;
  `,

  // v4 — esquema relacional: categorías, programación versionada, pausas,
  // alarmas, notificaciones programadas y sesiones temporizadas (ver v4.ts).
  migrateToV4,

  // v5 — despertador y recordatorios con mensaje propio (ver v5.ts).
  MIGRATION_V5,
];
