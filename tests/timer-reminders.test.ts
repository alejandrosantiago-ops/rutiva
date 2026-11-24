import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discardSession, elapsedMs, finishSession, formatClock, isActiveSession, pauseSession, resumeSession } from '../src/domain/timer.ts';
import { MAX_PER_HABIT, planHabitReminders } from '../src/domain/reminders.ts';
import { applyReminderPlan, type NotificationGateway } from '../src/services/notifications/sync.ts';
import type { Habit, TimedSession } from '../src/domain/types.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 20, 10, 0, 0);

function session(): TimedSession {
  return {
    id: 's',
    kind: 'habit',
    habitId: 'h',
    date: '2026-11-20',
    startedAt: new Date(T0).toISOString(),
    runningSince: new Date(T0).toISOString(),
    accumulatedMs: 0,
    status: 'running',
    endedAt: null,
    resultMinutes: null,
  };
}

// ---------- Cronómetros ----------

test('cronómetro: iniciar, pausar, reanudar y finalizar', () => {
  let s = session();
  assert.equal(elapsedMs(s, T0 + 10 * MIN), 10 * MIN);
  s = pauseSession(s, T0 + 10 * MIN);
  assert.equal(s.status, 'paused');
  // En pausa el tiempo no avanza.
  assert.equal(elapsedMs(s, T0 + 60 * MIN), 10 * MIN);
  s = resumeSession(s, T0 + 60 * MIN);
  assert.equal(elapsedMs(s, T0 + 75 * MIN), 25 * MIN);
  s = finishSession(s, T0 + 75 * MIN + 29_000);
  assert.equal(s.status, 'finished');
  assert.equal(s.resultMinutes, 25, 'se redondea al minuto más cercano');
  assert.equal(isActiveSession(s), false);
});

test('cronómetro: las transiciones inválidas no cambian nada', () => {
  const running = session();
  assert.equal(resumeSession(running, T0 + MIN), running);
  const paused = pauseSession(running, T0 + MIN);
  assert.equal(pauseSession(paused, T0 + 5 * MIN), paused);
  const done = finishSession(paused, T0 + 9 * MIN);
  assert.equal(done.resultMinutes, 1, 'terminar en pausa usa el tiempo acumulado');
  assert.equal(finishSession(done, T0 + 99 * MIN), done);
  assert.equal(discardSession(done, T0 + 99 * MIN), done);
});

test('cronómetro: sobrevive a cerrar la app (se guarda y se reconstruye)', () => {
  const before = pauseSession(resumeSession(pauseSession(session(), T0 + 7 * MIN), T0 + 20 * MIN), T0 + 23 * MIN);
  const restored = JSON.parse(JSON.stringify(before)) as TimedSession;
  assert.equal(elapsedMs(restored, T0 + 999 * MIN), 10 * MIN);
  const running = JSON.parse(JSON.stringify(session())) as TimedSession;
  assert.equal(elapsedMs(running, T0 + 3 * 60 * MIN), 180 * MIN, 'sigue contando aunque la app estuviera cerrada');
});

test('cronómetro: descartar y formato', () => {
  const d = discardSession(session(), T0 + 5 * MIN);
  assert.equal(d.status, 'discarded');
  assert.equal(d.resultMinutes, null);
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(elapsedMs(session(), T0 - 5000), 0, 'un reloj desajustado no da tiempos negativos');
});

// ---------- Recordatorios ----------

const META = { createdAt: '', updatedAt: '', deletedAt: null };
const habit = (over: Partial<Habit> = {}): Habit => ({
  ...META,
  id: 'h',
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
  reminderTimes: ['21:00', '08:30'],
  notificationIds: [],
  pauses: [],
  scheduleHistory: [],
  archived: false,
  sortOrder: 0,
  ...over,
});
const NOW = new Date(2026, 10, 20, 12, 0); // viernes 20, 12:00 local

test('plan: diario y días concretos usan avisos repetitivos', () => {
  assert.deepEqual(planHabitReminders(habit(), NOW), [
    { time: '08:30', trigger: { type: 'daily', hour: 8, minute: 30 } },
    { time: '21:00', trigger: { type: 'daily', hour: 21, minute: 0 } },
  ]);
  const weekly = planHabitReminders(habit({ frequency: 'weekly', daysOfWeek: [5, 1], reminderTimes: ['07:00'] }), NOW);
  assert.deepEqual(weekly.map((p) => p.trigger), [
    { type: 'weekly', weekday: 2, hour: 7, minute: 0 },
    { type: 'weekly', weekday: 6, hour: 7, minute: 0 },
  ]);
});

test('plan: sin recordatorios, archivado, pausado o notificaciones apagadas → ninguno', () => {
  assert.deepEqual(planHabitReminders(habit({ reminderTimes: [] }), NOW), []);
  assert.deepEqual(planHabitReminders(habit({ archived: true }), NOW), []);
  assert.deepEqual(planHabitReminders(habit({ pauses: [{ from: '2026-11-19', to: null }] }), NOW), []);
  assert.deepEqual(planHabitReminders(habit({ deletedAt: 'x' }), NOW), []);
  assert.deepEqual(planHabitReminders(habit(), NOW, false), []);
});

test('plan: intervalos y fecha de fin generan avisos por fecha, nunca en el pasado', () => {
  const every2 = planHabitReminders(habit({ frequency: 'interval', intervalDays: 2, startDate: '2026-11-20', reminderTimes: ['09:00', '20:00'] }), NOW);
  const firstAt = every2[0].trigger.type === 'date' ? every2[0].trigger.at : null;
  assert.equal(firstAt!.getDate(), 20);
  assert.equal(firstAt!.getHours(), 20, 'las 09:00 de hoy ya pasaron');
  const days = new Set(every2.map((p) => (p.trigger.type === 'date' ? p.trigger.at.getDate() : -1)));
  assert.deepEqual([...days], [20, 22, 24, 26, 28, 30, 2]);

  const ending = planHabitReminders(habit({ endDate: '2026-11-22', reminderTimes: ['21:00'] }), NOW);
  assert.equal(ending.length, 3, 'hoy, 21 y 22');
  assert.equal(planHabitReminders(habit({ endDate: '2026-11-19' }), NOW).length, 0);
});

test('plan: respeta el máximo de avisos por hábito (límite de iOS)', () => {
  const many = planHabitReminders(habit({ endDate: '2026-12-31', reminderTimes: ['06:00', '09:00', '13:00', '17:00', '21:00'] }), NOW);
  assert.equal(many.length, MAX_PER_HABIT);
});

function fakeGateway() {
  const scheduled = new Map<string, unknown>();
  const cancelled: string[] = [];
  let n = 0;
  const gateway: NotificationGateway = {
    async schedule(_content, trigger) {
      const id = `n${++n}`;
      scheduled.set(id, trigger);
      return id;
    },
    async cancel(id) {
      cancelled.push(id);
      scheduled.delete(id);
    },
  };
  return { gateway, scheduled, cancelled };
}

const content = { title: 'Leer', body: '¡A por ello!' };

test('editar recordatorios: se cancelan los anteriores y se programan los nuevos', async () => {
  const { gateway, scheduled, cancelled } = fakeGateway();
  const first = await applyReminderPlan(gateway, [], planHabitReminders(habit(), NOW), content);
  assert.deepEqual(Object.keys(first).sort(), ['08:30', '21:00']);
  assert.equal(scheduled.size, 2);

  const previous = Object.values(first).flat();
  const edited = await applyReminderPlan(gateway, previous, planHabitReminders(habit({ reminderTimes: ['07:15'] }), NOW), content);
  assert.deepEqual(cancelled.sort(), previous.sort());
  assert.deepEqual(Object.keys(edited), ['07:15']);
  assert.equal(scheduled.size, 1, 'solo queda el nuevo: no hay avisos huérfanos');
});

test('desactivar o pausar cancela todos los avisos', async () => {
  const { gateway, scheduled } = fakeGateway();
  const ids = Object.values(await applyReminderPlan(gateway, [], planHabitReminders(habit(), NOW), content)).flat();
  const after = await applyReminderPlan(gateway, ids, planHabitReminders(habit({ pauses: [{ from: '2026-11-20', to: null }] }), NOW), content);
  assert.deepEqual(after, {});
  assert.equal(scheduled.size, 0);
});

test('un fallo al cancelar un aviso antiguo no impide programar los nuevos', async () => {
  const { gateway, scheduled } = fakeGateway();
  const flaky: NotificationGateway = { ...gateway, cancel: async () => Promise.reject(new Error('ya no existe')) };
  const result = await applyReminderPlan(flaky, ['viejo'], planHabitReminders(habit({ reminderTimes: ['10:00'] }), NOW), content);
  assert.deepEqual(Object.keys(result), ['10:00']);
  assert.equal(scheduled.size, 1);
});
