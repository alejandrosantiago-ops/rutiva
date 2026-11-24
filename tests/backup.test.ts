import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../src/data/db/migrate.ts';
import { createSqliteRepositories } from '../src/data/repositories/sqlite.ts';
import { BackupError, parseBackup } from '../src/data/backup.ts';
import { nextScheduleHistory } from '../src/domain/habits.ts';
import type { HabitInput } from '../src/domain/types.ts';
import { createNodeDb } from './helpers/nodeDb.ts';

async function fresh() {
  const db = createNodeDb();
  await runMigrations(db);
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 20, 12, 0, tick++)).toISOString();
  return { db, repos: createSqliteRepositories({ getDb: async () => db, uuid: randomUUID, now }) };
}

const habitInput = (over: Partial<HabitInput> = {}): HabitInput => ({
  name: 'Entrenamiento',
  description: 'Gimnasio',
  category: 'exercise',
  icon: 'workout',
  color: '#F97316',
  trackingType: 'duration',
  target: 60,
  unit: null,
  frequency: 'weekly',
  daysOfWeek: [1, 3, 5],
  intervalDays: 1,
  startDate: '2026-11-01',
  endDate: null,
  suggestedTime: '07:00',
  reminderTimes: ['07:00'],
  remindersEnabled: true,
  reminderMessages: { '07:00': 'Hora de entrenar' },
  ...over,
});

test('exportar → importar conserva todos los datos', async () => {
  const a = await fresh();
  const gym = await a.repos.habits.create(habitInput());
  const edited = await a.repos.habits.update(gym.id, {
    target: 45,
    scheduleHistory: nextScheduleHistory(gym, { target: 45 }, '2026-11-15'),
    pauses: [{ from: '2026-11-08', to: '2026-11-09' }],
  });
  const read = await a.repos.habits.create(habitInput({ name: 'Leer', category: 'study', trackingType: 'check', target: 1, reminderTimes: [], reminderMessages: {} }));
  await a.repos.logs.setValue(gym.id, '2026-11-18', 50);
  await a.repos.logs.setValue(read.id, '2026-11-19', 1);
  await a.repos.water.add('2026-11-19', 250);
  await a.repos.water.add('2026-11-19', 500);
  await a.repos.sleep.save({
    date: '2026-11-19',
    bedtimeAt: '2026-11-19T04:00:00.000Z',
    wakeAt: '2026-11-19T12:00:00.000Z',
    latencyMinutes: 10,
    quality: 4,
    notes: 'bien',
    source: 'timer',
  });
  await a.repos.wakeAlarms.save({ label: 'Gimnasio', time: '06:30', daysOfWeek: [1, 3, 5], enabled: true, sound: 'soft', snoozeMinutes: 5, mode: 'app' });
  await a.repos.settings.save('userName', 'Ana');
  await a.repos.settings.save('waterGoalMl', 3000);
  await a.repos.settings.save('waterReminderEnabled', true);

  const text = JSON.stringify(await a.repos.exportAll());
  const backup = parseBackup(text);

  const b = await fresh();
  // Datos previos en el destino: la importación los sustituye.
  await b.repos.habits.create(habitInput({ name: 'Se borrará' }));
  await b.repos.importAll(backup);

  const habitsA = await a.repos.habits.list();
  const habitsB = await b.repos.habits.list();
  const strip = (h: (typeof habitsA)[number]) => ({ ...h, notificationIds: [] });
  assert.deepEqual(habitsB.map(strip), habitsA.map(strip));
  assert.equal(habitsB.find((h) => h.id === edited.id)!.scheduleHistory.length, 1);
  assert.deepEqual(
    (await b.repos.logs.list()).map((l) => [l.habitId, l.date, l.value]).sort(),
    (await a.repos.logs.list()).map((l) => [l.habitId, l.date, l.value]).sort(),
  );
  assert.deepEqual((await b.repos.water.list()).map((w) => w.amountMl).sort(), [250, 500]);
  const [night] = await b.repos.sleep.list();
  assert.equal(night.durationMinutes, 470);
  assert.equal(night.source, 'timer');
  const [alarm] = await b.repos.wakeAlarms.list();
  assert.equal(alarm.label, 'Gimnasio');
  assert.deepEqual(alarm.daysOfWeek, [1, 3, 5]);
  const s = await b.repos.settings.load();
  assert.equal(s.userName, 'Ana');
  assert.equal(s.waterGoalMl, 3000);
  assert.equal(s.waterReminderEnabled, true);
  assert.equal(b.db.raw.prepare('SELECT COUNT(*) n FROM scheduled_notifications').get()!.n, 0, 'los avisos se reprograman, no se copian');
});

test('importa copias de la primera versión de la app', () => {
  const legacy = {
    app: 'rutiva',
    version: 1,
    exportedAt: '2026-11-20T00:00:00.000Z',
    habits: [
      {
        id: 'h1',
        name: 'Agua',
        icon: 'water',
        color: '#06B6D4',
        frequency: 'custom',
        daysOfWeek: [1, 3],
        targetPerDay: 8,
        unit: 'vasos',
        reminderEnabled: true,
        reminderTime: '09:00',
        archived: false,
        sortOrder: 0,
        startDate: '2026-11-01',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    habitLogs: [{ id: 'l1', habitId: 'h1', date: '2026-11-03', count: 5, createdAt: '', updatedAt: '' }],
    sleepLogs: [],
    settings: { userName: 'Ana' },
  };
  const b = parseBackup(JSON.stringify(legacy));
  const [h] = b.habits;
  assert.equal(h.trackingType, 'count');
  assert.equal(h.target, 8);
  assert.equal(h.frequency, 'weekly');
  assert.deepEqual(h.reminderTimes, ['09:00']);
  assert.equal(h.remindersEnabled, true);
  assert.equal(b.habitLogs[0].value, 5);
});

test('rechaza archivos que no son copias válidas', () => {
  assert.throws(() => parseBackup('hola'), BackupError);
  assert.throws(() => parseBackup('{"app":"otra"}'), /no es una copia de seguridad de Rutiva/);
  assert.throws(() => parseBackup('{"app":"rutiva","version":99,"habits":[]}'), /versión más nueva/);
  assert.throws(() => parseBackup('{"app":"rutiva","version":5,"habits":[{"id":"x","name":""}]}'), /incompletos/);
  assert.throws(() => parseBackup('{"app":"rutiva","version":5}'), /vacía/);
});

test('ignora registros que apuntan a hábitos inexistentes', () => {
  const b = parseBackup(
    JSON.stringify({
      app: 'rutiva',
      version: 5,
      habits: [],
      habitLogs: [{ id: 'x', habitId: 'fantasma', date: '2026-11-20', value: 1 }],
      waterLogs: [{ id: 'w', date: '2026-11-20', amountMl: 250 }],
      settings: {},
    }),
  );
  assert.equal(b.habitLogs.length, 0);
  assert.equal(b.waterLogs.length, 1);
});
