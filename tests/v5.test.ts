import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describeUntil, describeWakeDays, nextWakeAt, planWakeAlarm, snoozeTrigger } from '../src/domain/wake.ts';
import { habitNotificationUrl, planHabitReminders, reminderMessage } from '../src/domain/reminders.ts';
import { applyReminderPlan, type NotificationGateway } from '../src/services/notifications/sync.ts';
import { runMigrations } from '../src/data/db/migrate.ts';
import { createSqliteRepositories } from '../src/data/repositories/sqlite.ts';
import type { Habit, HabitInput, WakeAlarm } from '../src/domain/types.ts';
import { createNodeDb } from './helpers/nodeDb.ts';

const wake = (over: Partial<WakeAlarm> = {}): WakeAlarm => ({
  id: 'a',
  label: 'Buenos días',
  time: '07:30',
  daysOfWeek: [1, 2, 3, 4, 5],
  enabled: true,
  sound: 'classic',
  snoozeMinutes: 10,
  mode: 'app',
  notificationIds: [],
  ...over,
});

// ---------- Despertador ----------

test('despertador: avisos semanales por día o uno diario', () => {
  assert.deepEqual(planWakeAlarm(wake()).map((t) => (t.type === 'weekly' ? t.weekday : -1)), [2, 3, 4, 5, 6]);
  assert.deepEqual(planWakeAlarm(wake({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })), [{ type: 'daily', hour: 7, minute: 30 }]);
  assert.deepEqual(planWakeAlarm(wake({ enabled: false })), [], 'desactivada');
  assert.deepEqual(planWakeAlarm(wake({ mode: 'system' })), [], 'la gestiona el Reloj del sistema');
});

test('despertador: próxima vez que suena', () => {
  const friday0700 = new Date(2026, 10, 20, 7, 0); // viernes
  assert.equal(nextWakeAt(wake(), friday0700)!.getDate(), 20, 'hoy a las 7:30');
  const friday0800 = new Date(2026, 10, 20, 8, 0);
  const next = nextWakeAt(wake(), friday0800)!;
  assert.equal(next.getDate(), 23, 'ya pasó: el lunes');
  assert.equal(next.getHours(), 7);
  assert.equal(next.getMinutes(), 30);
  assert.equal(describeUntil(next, friday0800), 'en 2 días y 23 h');
  assert.equal(nextWakeAt(wake({ enabled: false }), friday0800), null);
  assert.equal(describeUntil(new Date(friday0700.getTime() + 95 * 60000), friday0700), 'en 1 h 35 min');
});

test('despertador: posponer y días', () => {
  const now = new Date(2026, 10, 20, 7, 30);
  const t = snoozeTrigger(10, now);
  assert.equal(t.type === 'date' && t.at.getMinutes(), 40);
  assert.equal(describeWakeDays([1, 2, 3, 4, 5]), 'De lunes a viernes');
  assert.equal(describeWakeDays([0, 6]), 'Fines de semana');
  assert.equal(describeWakeDays([0, 1, 2, 3, 4, 5, 6]), 'Todos los días');
  assert.equal(describeWakeDays([3, 1]), 'L · X');
});

// ---------- Recordatorios personalizados ----------

const META = { createdAt: '', updatedAt: '', deletedAt: null };
const habit = (over: Partial<Habit> = {}): Habit => ({
  ...META,
  id: 'h',
  name: 'Entrenamiento',
  description: null,
  category: 'exercise',
  icon: 'workout',
  color: '#000',
  trackingType: 'duration',
  target: 60,
  unit: null,
  frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  intervalDays: 1,
  startDate: '2026-11-01',
  endDate: null,
  suggestedTime: null,
  reminderTimes: ['07:00', '19:00'],
  remindersEnabled: true,
  reminderMessages: { '07:00': 'A sudar un poco' },
  notificationIds: [],
  pauses: [],
  scheduleHistory: [],
  archived: false,
  sortOrder: 0,
  ...over,
});

test('recordatorios: desactivarlos no programa nada (pero conserva las horas)', () => {
  const off = habit({ remindersEnabled: false });
  assert.deepEqual(planHabitReminders(off, new Date(2026, 10, 20, 6, 0)), []);
  assert.deepEqual(off.reminderTimes, ['07:00', '19:00']);
});

test('recordatorios: mensaje personalizado o según la categoría', () => {
  const h = habit();
  assert.equal(reminderMessage(h, '07:00'), 'A sudar un poco');
  assert.equal(reminderMessage(h, '19:00'), 'Hora de entrenar.');
  assert.equal(reminderMessage(habit({ category: 'hydration' }), '09:00'), 'Recuerda beber agua.');
  assert.equal(reminderMessage(habit({ category: 'study' }), '15:00'), 'Hora de estudiar.');
  assert.equal(reminderMessage(habit({ category: 'sleep' }), '21:30'), 'Prepárate para dormir.');
  assert.equal(reminderMessage(habit({ category: 'custom', name: 'Regar' }), '08:00'), 'Es momento de: Regar.');
});

test('recordatorios: cada aviso lleva su mensaje', async () => {
  const sent: string[] = [];
  const gateway: NotificationGateway = {
    async schedule(content) {
      sent.push(content.body);
      return String(sent.length);
    },
    async cancel() {},
  };
  const h = habit();
  await applyReminderPlan(gateway, [], planHabitReminders(h, new Date(2026, 10, 20, 6, 0)), (time) => ({
    title: h.name,
    body: reminderMessage(h, time),
  }));
  assert.deepEqual(sent, ['A sudar un poco', 'Hora de entrenar.']);
});

test('al tocar la notificación se abre la pantalla correspondiente', () => {
  assert.equal(habitNotificationUrl(habit()), '/habit/log/h', 'duración → registrar tiempo');
  assert.equal(habitNotificationUrl(habit({ trackingType: 'check' })), '/habit/h', 'simple → detalle');
  assert.equal(habitNotificationUrl(habit({ category: 'hydration', trackingType: 'quantity', unit: 'L' })), '/water');
});

// ---------- Persistencia ----------

async function setup() {
  const db = createNodeDb();
  await runMigrations(db);
  return { db, repos: createSqliteRepositories({ getDb: async () => db, uuid: randomUUID }) };
}

test('persistencia: mensajes y activación de recordatorios', async () => {
  const { repos } = await setup();
  const input: HabitInput = {
    name: 'Leer',
    description: null,
    category: 'study',
    icon: 'book',
    color: '#000',
    trackingType: 'check',
    target: 1,
    unit: null,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    intervalDays: 1,
    startDate: '2026-11-01',
    endDate: null,
    suggestedTime: null,
    reminderTimes: ['08:00', '21:00'],
    remindersEnabled: true,
    reminderMessages: { '21:00': 'Diez páginas antes de dormir' },
  };
  const h = await repos.habits.create(input);
  assert.deepEqual(h.reminderMessages, { '21:00': 'Diez páginas antes de dormir' });
  const off = await repos.habits.update(h.id, { remindersEnabled: false });
  assert.equal(off.remindersEnabled, false);
  assert.deepEqual(off.reminderTimes, ['08:00', '21:00'], 'las horas se conservan');
  const on = await repos.habits.update(h.id, { remindersEnabled: true, reminderMessages: {} });
  assert.equal(on.remindersEnabled, true);
  assert.deepEqual(on.reminderMessages, {});
});

test('persistencia: alarmas de despertar', async () => {
  const { db, repos } = await setup();
  const { id: _i, notificationIds: _n, ...input } = wake();
  const saved = await repos.wakeAlarms.save({ ...input, daysOfWeek: [6, 0] });
  assert.deepEqual(saved.daysOfWeek, [0, 6]);
  const withIds = await repos.wakeAlarms.setNotifications(saved.id, ['w1', 'w2']);
  assert.deepEqual(withIds.notificationIds.sort(), ['w1', 'w2']);
  const edited = await repos.wakeAlarms.save({ ...input, time: '06:45', mode: 'system', snoozeMinutes: 5 }, saved.id);
  assert.equal(edited.time, '06:45');
  assert.equal(edited.mode, 'system');
  assert.equal((await repos.wakeAlarms.list()).length, 1);
  assert.throws(
    () => db.raw.prepare(`UPDATE alarms SET days_mask = 0 WHERE id = ?`).run(saved.id),
    /CHECK/,
    'una alarma necesita al menos un día',
  );
  await repos.wakeAlarms.remove(saved.id);
  assert.equal((await repos.wakeAlarms.list()).length, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM scheduled_notifications').get()!.n, 0, 'sus avisos se borran en cascada');
});

test('v4 → v5 conserva alarmas y avisos programados', async () => {
  const db = createNodeDb();
  await runMigrations(db, undefined, 4);
  const ts = '2026-11-20T00:00:00.000Z';
  // v4 ya crea la alarma única de la hora de dormir: se modifica.
  db.raw.prepare(`UPDATE alarms SET time = '23:00', enabled = 1 WHERE id = 'bedtime'`).run();
  db.raw.prepare(`INSERT INTO scheduled_notifications (notification_id, alarm_id, created_at) VALUES ('b1', 'bedtime', ?)`).run(ts);
  assert.equal(await runMigrations(db), 5);
  const repos = createSqliteRepositories({ getDb: async () => db, uuid: randomUUID });
  const s = await repos.settings.load();
  assert.equal(s.bedtimeReminderTime, '23:00');
  assert.equal(s.bedtimeNotificationId, 'b1');
});

test('reordenar: mover desplaza los intermedios (no intercambia)', async () => {
  const { moveTo, orderOf } = await import('../src/features/habits/components/reorder.ts');
  const start = { a: 0, b: 1, c: 2, d: 3 };
  assert.deepEqual(orderOf(moveTo(start, 'd', 0)), ['d', 'a', 'b', 'c'], 'de abajo arriba');
  assert.deepEqual(orderOf(moveTo(start, 'a', 2)), ['b', 'c', 'a', 'd'], 'de arriba abajo');
  assert.equal(moveTo(start, 'b', 1), start, 'sin cambios');
  // Arrastre real: muchos pasos pequeños dan el mismo resultado que un salto.
  const stepwise = moveTo(moveTo(moveTo(start, 'd', 2), 'd', 1), 'd', 0);
  assert.deepEqual(orderOf(stepwise), ['d', 'a', 'b', 'c']);
});
