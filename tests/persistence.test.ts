import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../src/data/db/migrate.ts';
import { createSqliteRepositories } from '../src/data/repositories/sqlite.ts';
import { nextScheduleHistory, isDoneOn, isScheduledOn } from '../src/domain/habits.ts';
import type { HabitInput } from '../src/domain/types.ts';
import { createNodeDb } from './helpers/nodeDb.ts';

const TODAY = '2026-11-20';

async function setup() {
  const db = createNodeDb();
  await runMigrations(db);
  let tick = 0;
  // Reloj simulado y creciente para que los ordenamientos sean deterministas.
  const now = () => new Date(Date.UTC(2026, 10, 20, 12, 0, tick++)).toISOString();
  const repos = createSqliteRepositories({ getDb: async () => db, uuid: randomUUID, now });
  return { db, repos };
}

const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: 'Beber agua',
  description: null,
  category: 'hydration',
  icon: 'water',
  color: '#06B6D4',
  trackingType: 'quantity',
  target: 2.5,
  unit: 'L',
  frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  intervalDays: 1,
  startDate: '2026-11-01',
  endDate: null,
  suggestedTime: '08:00',
  reminderTimes: ['09:00', '15:00'],
  remindersEnabled: true,
  reminderMessages: {},
  ...over,
});

test('crear y leer un hábito: definición, programación y recordatorios en tablas separadas', async () => {
  const { db, repos } = await setup();
  const h = await repos.habits.create(input());
  assert.equal(h.target, 2.5);
  assert.deepEqual(h.reminderTimes, ['09:00', '15:00']);
  const [reloaded] = await repos.habits.list();
  assert.deepEqual(reloaded, h);
  const schedules = db.raw.prepare('SELECT * FROM habit_schedules WHERE habit_id = ?').all(h.id);
  assert.equal(schedules.length, 1);
  assert.equal((schedules[0] as { days_mask: number }).days_mask, 127);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) n FROM alarms WHERE habit_id = ?`).get(h.id)!.n, 2);
});

test('editar la programación guarda la versión anterior y los días pasados no cambian', async () => {
  const { db, repos } = await setup();
  const h = await repos.habits.create(input({ trackingType: 'check', target: 1, unit: null, category: 'health', reminderTimes: [] }));
  const patch = { frequency: 'weekly' as const, daysOfWeek: [1, 3, 5] as HabitInput['daysOfWeek'] };
  const edited = await repos.habits.update(h.id, { ...patch, scheduleHistory: nextScheduleHistory(h, patch, '2026-11-18') });
  assert.equal(edited.scheduleHistory.length, 1);
  assert.equal(isScheduledOn(edited, '2026-11-15'), true); // domingo, antes del cambio
  assert.equal(isScheduledOn(edited, '2026-11-19'), false); // jueves, después
  const rows = db.raw.prepare('SELECT valid_from, valid_until FROM habit_schedules WHERE habit_id = ? ORDER BY valid_from').all(h.id);
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { valid_from: '2026-11-01', valid_until: '2026-11-17' },
    { valid_from: '2026-11-18', valid_until: null },
  ]);
});

test('editar recordatorios conserva los avisos de las horas que siguen y borra los de las quitadas', async () => {
  const { db, repos } = await setup();
  const h = await repos.habits.create(input());
  let saved = await repos.habits.setReminderNotifications(h.id, { '09:00': ['n1'], '15:00': ['n2', 'n3'] });
  assert.deepEqual(saved.notificationIds.sort(), ['n1', 'n2', 'n3']);
  saved = await repos.habits.update(h.id, { reminderTimes: ['09:00', '21:00'] });
  assert.deepEqual(saved.reminderTimes, ['09:00', '21:00']);
  assert.deepEqual(saved.notificationIds, ['n1'], 'los de las 15:00 se borran en cascada');
  saved = await repos.habits.update(h.id, { reminderTimes: [] });
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM scheduled_notifications').get()!.n, 0);
});

test('registros diarios: upsert sin duplicados, valores decimales y CHECK de valores', async () => {
  const { db, repos } = await setup();
  const h = await repos.habits.create(input({ reminderTimes: [] }));
  await repos.logs.setValue(h.id, TODAY, 1.25);
  await repos.logs.setValue(h.id, TODAY, 2.5);
  await repos.logs.setValue(h.id, '2026-11-19', 0.1 + 0.2);
  const logs = await repos.logs.list();
  assert.equal(logs.length, 2);
  assert.equal(logs.find((l) => l.date === TODAY)!.value, 2.5);
  assert.equal(logs.find((l) => l.date === '2026-11-19')!.value, 0.3, 'redondeado sin errores de coma flotante');
  assert.throws(() => db.raw.prepare(`INSERT INTO habit_logs (id, habit_id, date, value, created_at, updated_at) VALUES ('x', ?, ?, 1, '', '')`).run(h.id, TODAY), /UNIQUE/);
  assert.throws(() => db.raw.prepare(`UPDATE habit_logs SET value = -1`).run(), /CHECK/);
  assert.throws(() => db.raw.prepare(`INSERT INTO habit_logs (id, habit_id, date, value, created_at, updated_at) VALUES ('y', 'no-existe', ?, 1, '', '')`).run(TODAY), /FOREIGN KEY/);
});

test('pausas y archivado se guardan como filas y respetan una sola pausa abierta', async () => {
  const { db, repos } = await setup();
  const h = await repos.habits.create(input({ reminderTimes: [] }));
  const paused = await repos.habits.update(h.id, { pauses: [{ from: '2026-11-10', to: '2026-11-12' }, { from: TODAY, to: null, reason: 'archive' }], archived: true });
  assert.equal(paused.archived, true);
  assert.deepEqual(paused.pauses, [{ from: '2026-11-10', to: '2026-11-12' }, { from: TODAY, to: null, reason: 'archive' }]);
  assert.throws(
    () => db.raw.prepare(`INSERT INTO habit_pauses (id, habit_id, start_date, end_date, created_at) VALUES ('p', ?, '2026-11-21', NULL, '')`).run(h.id),
    /UNIQUE/,
  );
});

test('borrado lógico y deshacer', async () => {
  const { repos } = await setup();
  const h = await repos.habits.create(input({ reminderTimes: [] }));
  await repos.logs.setValue(h.id, TODAY, 1);
  await repos.habits.remove(h.id);
  assert.equal((await repos.habits.list()).length, 0);
  assert.equal((await repos.logs.list()).length, 0, 'los registros de un hábito eliminado no se cargan');
  await repos.habits.restore(h.id);
  assert.equal((await repos.habits.list()).length, 1);
  assert.equal((await repos.logs.list()).length, 1, 'al deshacer vuelve con su historial');
});

test('agua: añadir, borrar y restaurar', async () => {
  const { repos } = await setup();
  const a = await repos.water.add(TODAY, 250);
  await repos.water.add(TODAY, 500);
  await repos.water.remove(a.id);
  assert.deepEqual((await repos.water.list()).map((w) => w.amountMl), [500]);
  await repos.water.restore(a.id);
  assert.deepEqual((await repos.water.list()).map((w) => w.amountMl).sort(), [250, 500]);
});

test('sueño: una noche por fecha y restauración', async () => {
  const { repos } = await setup();
  const base = { date: TODAY, latencyMinutes: 15, quality: 4, notes: null, source: 'manual' as const };
  const first = await repos.sleep.save({ ...base, bedtimeAt: '2026-11-20T04:00:00.000Z', wakeAt: '2026-11-20T12:00:00.000Z' });
  assert.equal(first.durationMinutes, 465);
  const second = await repos.sleep.save({ ...base, bedtimeAt: '2026-11-20T05:00:00.000Z', wakeAt: '2026-11-20T12:00:00.000Z' });
  assert.deepEqual((await repos.sleep.list()).map((s) => s.id), [second.id], 'la nueva reemplaza a la anterior del mismo día');
  await repos.sleep.restore(first.id);
  assert.deepEqual((await repos.sleep.list()).map((s) => s.id), [first.id]);
});

test('sesiones temporizadas: una activa por tipo e historial', async () => {
  const { repos } = await setup();
  const h = await repos.habits.create(input({ trackingType: 'duration', target: 60, unit: null, reminderTimes: [] }));
  const s = await repos.sessions.start('habit', '2026-11-20T10:00:00.000Z', h.id, TODAY);
  await assert.rejects(repos.sessions.start('habit', '2026-11-20T10:05:00.000Z', h.id, TODAY), /UNIQUE/);
  const sleep = await repos.sessions.start('sleep', '2026-11-20T03:00:00.000Z');
  assert.equal((await repos.sessions.active('sleep'))!.id, sleep.id, 'otra clase de sesión sí puede convivir');
  await repos.sessions.save({ ...s, status: 'finished', runningSince: null, accumulatedMs: 3_600_000, endedAt: '2026-11-20T11:00:00.000Z', resultMinutes: 60 });
  assert.equal(await repos.sessions.active('habit'), null);
  const [done] = await repos.sessions.history('habit');
  assert.equal(done.resultMinutes, 60);
});

test('ajustes: preferencias en user_settings y alarmas en su tabla', async () => {
  const { db, repos } = await setup();
  await repos.settings.save('userName', 'Ana');
  await repos.settings.save('waterReminderEnabled', true);
  await repos.settings.save('waterReminderEveryMinutes', 90);
  await repos.settings.save('waterNotificationIds', ['w1', 'w2']);
  await repos.settings.save('bedtimeReminderTime', '23:15');
  await repos.settings.save('bedtimeNotificationId', 'b1');
  const s = await repos.settings.load();
  assert.equal(s.userName, 'Ana');
  assert.equal(s.waterReminderEnabled, true);
  assert.equal(s.waterReminderEveryMinutes, 90);
  assert.deepEqual(s.waterNotificationIds, ['w1', 'w2']);
  assert.equal(s.bedtimeReminderTime, '23:15');
  assert.equal(s.bedtimeNotificationId, 'b1');
  assert.equal(db.raw.prepare(`SELECT COUNT(*) n FROM user_settings WHERE key LIKE 'water%'`).get()!.n, 0);
  await repos.settings.save('bedtimeNotificationId', null);
  assert.equal((await repos.settings.load()).bedtimeNotificationId, null);
});

test('restablecer borra todo y la app sigue funcionando', async () => {
  const { db, repos } = await setup();
  const h = await repos.habits.create(input());
  await repos.logs.setValue(h.id, TODAY, 1);
  await repos.water.add(TODAY, 250);
  await repos.sessions.start('sleep', '2026-11-20T03:00:00.000Z');
  await repos.resetAll();
  for (const t of ['habits', 'habit_logs', 'water_logs', 'timed_sessions', 'alarms', 'user_settings']) {
    assert.equal(db.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get()!.n, 0, t);
  }
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM categories').get()!.n, 10, 'el catálogo de categorías se conserva');
  const s = await repos.settings.load();
  assert.equal(s.bedtimeReminderTime, '22:30', 'las alarmas únicas se recrean con valores por defecto');
});

test('v3 → v4: hábitos, historial, pausas, recordatorios, ajustes y sesiones se conservan', async () => {
  const db = createNodeDb();
  await runMigrations(db, undefined, 3);
  const ts = '2026-11-10T12:00:00.000Z';
  db.raw
    .prepare(
      `INSERT INTO habits (id, name, category, icon, color, tracking_type, target, unit, frequency, days_of_week, interval_days, start_date,
       reminder_times, notification_ids, pauses, schedule_history, archived, sort_order, created_at, updated_at)
       VALUES ('h', 'Leer', 'study', 'book', '#000', 'count', 3, 'páginas', 'weekly', '[1,3,5]', 1, '2026-11-01',
       '["21:00","08:00"]', '["n1","n2"]', '[{"from":"2026-11-05","to":"2026-11-06"},{"from":"2026-11-15","to":null,"reason":"archive"}]',
       '[{"until":"2026-11-09","frequency":"daily","daysOfWeek":[0,1,2,3,4,5,6],"intervalDays":1,"target":1}]', 1, 0, ?, ?)`,
    )
    .run(ts, ts);
  db.raw.prepare(`INSERT INTO habit_logs (id, habit_id, date, count, created_at, updated_at) VALUES ('l', 'h', '2026-11-03', 1, ?, ?)`).run(ts, ts);
  for (const [k, v] of [
    ['waterReminderEnabled', 'true'],
    ['waterReminderEveryMinutes', '60'],
    ['waterNotificationIds', '["w1"]'],
    ['bedtimeReminderTime', '"23:00"'],
    ['activeTimer', '{"habitId":"h","date":"2026-11-10","runningSince":null,"accumulatedMs":120000}'],
    ['sleepSession', '{"startedAt":"2026-11-10T03:00:00.000Z"}'],
    ['userName', '"Ana"'],
  ]) {
    db.raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v);
  }

  assert.equal(await runMigrations(db), 5);
  const repos = createSqliteRepositories({ getDb: async () => db, uuid: randomUUID });

  const [habit] = await repos.habits.list();
  assert.equal(habit.id, 'h');
  assert.equal(habit.category, 'study');
  assert.equal(habit.trackingType, 'count');
  assert.equal(habit.target, 3);
  assert.deepEqual(habit.daysOfWeek, [1, 3, 5]);
  assert.deepEqual(habit.reminderTimes, ['08:00', '21:00']);
  assert.deepEqual(habit.notificationIds.sort(), ['n1', 'n2']);
  assert.deepEqual(habit.pauses, [
    { from: '2026-11-05', to: '2026-11-06' },
    { from: '2026-11-15', to: null, reason: 'archive' },
  ]);
  assert.deepEqual(habit.scheduleHistory, [{ until: '2026-11-09', frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalDays: 1, target: 1 }]);
  // El 3 de noviembre (martes) regía la regla diaria con meta 1: cumplido.
  const logs = await repos.logs.list();
  assert.equal(isDoneOn(habit, { '2026-11-03': { h: logs[0].value } }, '2026-11-03'), true);

  const settings = await repos.settings.load();
  assert.equal(settings.userName, 'Ana');
  assert.equal(settings.waterReminderEnabled, true);
  assert.equal(settings.waterReminderEveryMinutes, 60);
  assert.deepEqual(settings.waterNotificationIds, ['w1']);
  assert.equal(settings.bedtimeReminderTime, '23:00');
  assert.equal(settings.onboarded, true, 'quien ya tenía hábitos no ve la bienvenida');
  assert.equal((await repos.sessions.active('habit'))!.accumulatedMs, 120000);
  assert.equal((await repos.sessions.active('sleep'))!.startedAt, '2026-11-10T03:00:00.000Z');
});
