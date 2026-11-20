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
export const MIGRATIONS: string[] = [
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
];
