import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../src/data/db/migrate.ts';
import { createSqliteRepositories } from '../src/data/repositories/sqlite.ts';
import { syncOnce, type SyncState } from '../src/data/sync/engine.ts';
import type { HabitInput } from '../src/domain/types.ts';
import { createNodeDb } from './helpers/nodeDb.ts';
import { createFakeRemote } from './helpers/fakeRemote.ts';

/** Reloj compartido y siempre creciente para los dos "teléfonos". */
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 25, 8, 0, 0) + tick++ * 1000).toISOString();

async function device() {
  const db = createNodeDb();
  await runMigrations(db);
  const repos = createSqliteRepositories({ getDb: async () => db, uuid: randomUUID, now: clock });
  let state: SyncState = { remoteCursor: null, lastPushedAt: null };
  return {
    repos,
    async sync(remote: ReturnType<typeof createFakeRemote>) {
      const r = await syncOnce(repos.sync, remote, state, new Date(clock()));
      state = r.state;
      return r;
    },
  };
}

const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: 'Leer',
  description: null,
  category: 'study',
  icon: 'book',
  color: '#3B82F6',
  trackingType: 'check',
  target: 1,
  unit: null,
  frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  intervalDays: 1,
  startDate: '2026-11-01',
  endDate: null,
  suggestedTime: null,
  reminderTimes: ['21:00'],
  remindersEnabled: true,
  reminderMessages: {},
  ...over,
});

test('un dispositivo nuevo recibe todo lo del otro', async () => {
  const remote = createFakeRemote();
  const a = await device();
  const b = await device();
  const h = await a.repos.habits.create(input());
  await a.repos.logs.setValue(h.id, '2026-11-24', 1);
  await a.repos.water.add('2026-11-24', 500);
  await a.repos.sleep.save({ date: '2026-11-24', bedtimeAt: '2026-11-24T04:00:00.000Z', wakeAt: '2026-11-24T12:00:00.000Z', latencyMinutes: 0, quality: 4, notes: null, source: 'manual' });
  await a.repos.settings.save('waterGoalMl', 3000);
  await a.repos.settings.save('themeMode', 'dark'); // propio de cada teléfono: no viaja

  const pushed = await a.sync(remote);
  assert.ok(pushed.pushed >= 5);
  await b.sync(remote);

  const [hb] = await b.repos.habits.list();
  assert.equal(hb.id, h.id);
  assert.deepEqual(hb.reminderTimes, ['21:00']);
  assert.deepEqual(hb.notificationIds, [], 'los avisos se programan en cada teléfono');
  assert.equal((await b.repos.logs.list()).length, 1);
  assert.equal((await b.repos.water.list())[0].amountMl, 500);
  assert.equal((await b.repos.sleep.list())[0].durationMinutes, 480);
  const sb = await b.repos.settings.load();
  assert.equal(sb.waterGoalMl, 3000);
  assert.notEqual(sb.themeMode, 'dark');
});

test('los cambios van y vuelven, y los borrados se propagan', async () => {
  const remote = createFakeRemote();
  const a = await device();
  const b = await device();
  const h = await a.repos.habits.create(input());
  await a.sync(remote);
  await b.sync(remote);

  await b.repos.habits.update(h.id, { target: 3, trackingType: 'count' });
  await b.repos.logs.setValue(h.id, '2026-11-25', 2);
  const w = await b.repos.water.add('2026-11-25', 250);
  await b.sync(remote);
  await a.sync(remote);
  const [ha] = await a.repos.habits.list();
  assert.equal(ha.target, 3);
  assert.equal((await a.repos.logs.list())[0].value, 2);

  await a.repos.water.remove(w.id);
  await a.repos.habits.remove(h.id);
  await a.sync(remote);
  await b.sync(remote);
  assert.equal((await b.repos.habits.list()).length, 0, 'el hábito borrado desaparece en el otro teléfono');
  assert.equal((await b.repos.water.list()).length, 0);
});

test('conflicto: gana la edición más reciente en los dos teléfonos', async () => {
  const remote = createFakeRemote();
  const a = await device();
  const b = await device();
  const h = await a.repos.habits.create(input());
  await a.sync(remote);
  await b.sync(remote);

  // Ambos editan sin conexión; la de A es posterior.
  await b.repos.habits.update(h.id, { name: 'Leer (B)' });
  await a.repos.habits.update(h.id, { name: 'Leer (A)' });
  await b.sync(remote);
  await a.sync(remote);
  await b.sync(remote);
  assert.equal((await a.repos.habits.list())[0].name, 'Leer (A)');
  assert.equal((await b.repos.habits.list())[0].name, 'Leer (A)');
});

test('dos noches el mismo día: queda una sola, la más reciente', async () => {
  const remote = createFakeRemote();
  const a = await device();
  const b = await device();
  const night = { date: '2026-11-25', latencyMinutes: 0, quality: 3, notes: null, source: 'manual' as const };
  await a.repos.sleep.save({ ...night, bedtimeAt: '2026-11-25T04:00:00.000Z', wakeAt: '2026-11-25T11:00:00.000Z' });
  await b.repos.sleep.save({ ...night, bedtimeAt: '2026-11-25T03:00:00.000Z', wakeAt: '2026-11-25T11:00:00.000Z' }); // posterior
  await a.sync(remote);
  await b.sync(remote);
  await a.sync(remote);
  const na = await a.repos.sleep.list();
  const nb = await b.repos.sleep.list();
  assert.equal(na.length, 1);
  assert.equal(nb.length, 1);
  assert.equal(na[0].durationMinutes, 480);
  assert.equal(nb[0].durationMinutes, 480);
});

test('sin cambios nuevos, la sincronización se estabiliza', async () => {
  const remote = createFakeRemote();
  const a = await device();
  const b = await device();
  await a.repos.habits.create(input());
  await a.sync(remote);
  await b.sync(remote);
  await a.sync(remote);
  await b.sync(remote);
  const last = await a.sync(remote);
  assert.equal(last.pulled, 0);
  assert.equal(last.pushed, 0);
});

test('filas del servidor: ida y vuelta exacta (incluido el formato de fecha de Postgres)', async () => {
  const { toRecords, fromRecords, pullFrom } = await import('../src/data/sync/records.ts');
  const a = await device();
  const h = await a.repos.habits.create(input({ reminderMessages: { '21:00': 'Diez páginas' } }));
  await a.repos.logs.setValue(h.id, '2026-11-25', 1);
  await a.repos.settings.save('userName', 'Ana');
  const changes = await a.repos.sync.changesSince(null);
  // Simula la respuesta de Postgres: JSON y fechas con "+00:00".
  const rows = JSON.parse(JSON.stringify(toRecords(changes))).map((r: { updated_at: string }) => ({
    ...r,
    updated_at: r.updated_at.replace('Z', '+00:00'),
  }));
  assert.deepEqual(fromRecords(rows), changes);
  assert.equal(pullFrom('2026-11-25T08:01:00.000Z'), '2026-11-25T08:00:00.000Z', 'repasa un minuto por si acaso');
});
