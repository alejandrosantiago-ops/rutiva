import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../src/db/migrations.ts';

/** Reproduce el proceso de src/db/client.ts sobre un SQLite real. */
function migrate(db: DatabaseSync, upTo: number) {
  db.exec('PRAGMA foreign_keys = OFF;');
  let version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  while (version < upTo) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[version]);
    db.exec(`PRAGMA user_version = ${version + 1}`);
    db.exec('COMMIT');
    version++;
  }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  db.exec('PRAGMA foreign_keys = ON;');
}

test('v1 → v2 conserva hábitos e historial y mapea los campos', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, 1);
  const ts = '2026-11-01T00:00:00.000Z';
  const insert = db.prepare(`INSERT INTO habits (id, name, description, icon, color, frequency, days_of_week, target_per_day,
    unit, reminder_enabled, reminder_time, notification_ids, archived, sort_order, start_date, created_at, updated_at)
    VALUES (?, ?, NULL, ?, '#000', ?, ?, ?, ?, ?, ?, '[]', 0, 0, '2026-11-01', ?, ?)`);
  insert.run('a', 'Agua', 'water', 'daily', '[0,1,2,3,4,5,6]', 8, 'vasos', 1, '09:00', ts, ts);
  insert.run('b', 'Leer', 'book', 'custom', '[1,3,5]', 1, null, 0, null, ts, ts);
  db.prepare(`INSERT INTO habit_logs (id, habit_id, date, count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'l1', 'a', '2026-11-19', 3, ts, ts,
  );
  db.prepare(`INSERT INTO habit_logs (id, habit_id, date, count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'l2', 'b', '2026-11-18', 1, ts, ts,
  );

  migrate(db, 2);

  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM habit_logs').get() as { n: number }).n, 2, 'el historial debe sobrevivir');
  const a = db.prepare('SELECT * FROM habits WHERE id = ?').get('a') as Record<string, unknown>;
  assert.equal(a.category, 'hydration');
  assert.equal(a.tracking_type, 'count');
  assert.equal(a.target, 8);
  assert.equal(a.unit, 'vasos');
  assert.equal(a.frequency, 'daily');
  assert.equal(a.reminder_times, '["09:00"]');
  const b = db.prepare('SELECT * FROM habits WHERE id = ?').get('b') as Record<string, unknown>;
  assert.equal(b.tracking_type, 'check');
  assert.equal(b.frequency, 'weekly');
  assert.equal(b.reminder_times, '[]');
  assert.equal(b.pauses, '[]');

  // La clave foránea sigue funcionando tras renombrar la tabla.
  db.prepare('DELETE FROM habits WHERE id = ?').run('b');
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM habit_logs').get() as { n: number }).n, 1);

  // Los valores decimales se guardan tal cual en habit_logs.
  db.prepare('UPDATE habit_logs SET count = 1.5 WHERE id = ?').run('l1');
  assert.equal((db.prepare('SELECT count FROM habit_logs WHERE id = ?').get('l1') as { count: number }).count, 1.5);

  // Tabla de agua creada.
  db.prepare(`INSERT INTO water_logs (id, date, amount_ml, created_at, updated_at) VALUES ('w', '2026-11-20', 250, ?, ?)`).run(ts, ts);
  assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 2);
});

test('v2 → v3: archivados pasan a pausa y el sueño recibe origen', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, 2);
  const ts = '2026-11-10T12:00:00.000Z';
  const insert = db.prepare(`INSERT INTO habits (id, name, icon, color, days_of_week, start_date, archived, pauses, created_at, updated_at)
    VALUES (?, 'x', 'target', '#000', '[0,1,2,3,4,5,6]', '2026-11-01', ?, ?, ?, ?)`);
  insert.run('arch', 1, '[]', ts, ts);
  insert.run('arch-paused', 1, '[{"from":"2026-11-05","to":null}]', ts, ts);
  insert.run('live', 0, '[]', ts, ts);
  db.prepare(`INSERT INTO sleep_logs (id, date, bedtime_at, wake_at, duration_minutes, created_at, updated_at)
    VALUES ('s', '2026-11-10', 'a', 'b', 480, ?, ?)`).run(ts, ts);

  migrate(db, 3);

  const pauses = (id: string) => JSON.parse((db.prepare('SELECT pauses FROM habits WHERE id = ?').get(id) as { pauses: string }).pauses);
  assert.deepEqual(pauses('arch'), [{ from: '2026-11-10', to: null, reason: 'archive' }]);
  assert.equal(pauses('arch-paused').length, 1, 'ya estaba en pausa: no se duplica');
  assert.deepEqual(pauses('live'), []);
  const sleep = db.prepare('SELECT source, latency_minutes, external_id FROM sleep_logs').get() as Record<string, unknown>;
  assert.deepEqual({ ...sleep }, { source: 'manual', latency_minutes: 0, external_id: null });
  const h = db.prepare('SELECT schedule_history FROM habits WHERE id = ?').get('live') as { schedule_history: string };
  assert.equal(h.schedule_history, '[]');
});

test('instalación nueva aplica todas las migraciones', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, MIGRATIONS.length);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => (r as { name: string }).name);
  assert.deepEqual(tables, ['habit_logs', 'habits', 'settings', 'sleep_logs', 'water_logs']);
});
