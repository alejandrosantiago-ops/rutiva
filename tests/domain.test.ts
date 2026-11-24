import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestStreak,
  currentStreak,
  dayProgress,
  describeFrequency,
  describeProgress,
  describeRemaining,
  habitStats,
  isPaused,
  isScheduledOn,
  nextHabit,
  perfectDayStreak,
} from '../src/domain/habits.ts';
import { computeSleepWindow, summarizeSleep, bedtimeOffset } from '../src/domain/sleep.ts';
import { minutesToTime, rangeKeys, shiftKey, timeToMinutes } from '../src/domain/dates.ts';
import { overview, weekdayPerformance } from '../src/domain/stats.ts';
import { isWaterHabit, mergeWaterIntoIndex, waterReminderSlots, waterTotals } from '../src/domain/water.ts';
import type { Habit, LogIndex, SleepLog, WaterLog } from '../src/domain/types.ts';

const META = { createdAt: '', updatedAt: '', deletedAt: null };

function habit(over: Partial<Habit> = {}): Habit {
  return {
    ...META,
    id: 'h1',
    name: 'Leer',
    description: null,
    category: 'study',
    icon: 'book',
    color: '#5B5BD6',
    trackingType: 'check',
    target: 1,
    unit: null,
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    intervalDays: 1,
    startDate: '2026-11-01',
    endDate: null,
    suggestedTime: null,
    reminderTimes: [],
    remindersEnabled: true,
    reminderMessages: {},
    notificationIds: [],
    pauses: [],
    scheduleHistory: [],
    archived: false,
    sortOrder: 0,
    ...over,
  };
}

function logsFor(id: string, dates: string[], value = 1): LogIndex {
  const idx: LogIndex = {};
  for (const d of dates) idx[d] = { ...(idx[d] ?? {}), [id]: value };
  return idx;
}

// 2026-11-20 es viernes.
const TODAY = '2026-11-20';

test('helpers de fechas', () => {
  assert.equal(shiftKey('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(rangeKeys('2026-11-29', '2026-12-01'), ['2026-11-29', '2026-11-30', '2026-12-01']);
  assert.equal(timeToMinutes('07:45'), 465);
  assert.equal(minutesToTime(-30), '23:30');
});

test('racha actual: hoy pendiente no rompe la racha', () => {
  const h = habit();
  const logs = logsFor('h1', ['2026-11-17', '2026-11-18', '2026-11-19']);
  assert.equal(currentStreak(h, logs, TODAY), 3);
  logs[TODAY] = { h1: 1 };
  assert.equal(currentStreak(h, logs, TODAY), 4);
});

test('racha actual: un hueco la corta', () => {
  const logs = logsFor('h1', ['2026-11-16', '2026-11-18', '2026-11-19']);
  assert.equal(currentStreak(habit(), logs, TODAY), 2);
});

test('días concretos: la racha ignora días no programados', () => {
  // Lunes, miércoles y viernes. 16=lun, 18=mié, 20=vie.
  const h = habit({ frequency: 'weekly', daysOfWeek: [1, 3, 5] });
  const logs = logsFor('h1', ['2026-11-16', '2026-11-18', '2026-11-20']);
  assert.equal(currentStreak(h, logs, TODAY), 3);
  assert.equal(isScheduledOn(h, '2026-11-19'), false);
});

test('intervalo: cada 3 días desde la fecha de inicio', () => {
  const h = habit({ frequency: 'interval', intervalDays: 3, startDate: '2026-11-14' });
  assert.equal(isScheduledOn(h, '2026-11-14'), true);
  assert.equal(isScheduledOn(h, '2026-11-15'), false);
  assert.equal(isScheduledOn(h, '2026-11-17'), true);
  assert.equal(isScheduledOn(h, TODAY), true);
  assert.equal(describeFrequency(h), 'Cada 3 días');
});

test('fecha de fin y pausas', () => {
  const ended = habit({ endDate: '2026-11-18' });
  assert.equal(isScheduledOn(ended, '2026-11-18'), true);
  assert.equal(isScheduledOn(ended, '2026-11-19'), false);

  const paused = habit({ pauses: [{ from: '2026-11-10', to: '2026-11-12' }, { from: '2026-11-19', to: null }] });
  assert.equal(isScheduledOn(paused, '2026-11-11'), false);
  assert.equal(isScheduledOn(paused, '2026-11-13'), true);
  assert.equal(isScheduledOn(paused, TODAY), false);
  assert.equal(isPaused(paused), true);
  // Los días pausados no rompen la racha.
  const logs = logsFor('h1', ['2026-11-09', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
  assert.equal(currentStreak(paused, logs, TODAY), 7);
});

test('mejor racha', () => {
  const logs = logsFor('h1', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
  assert.equal(bestStreak(habit(), logs, TODAY), 3);
});

test('progreso parcial y decimales', () => {
  const water = habit({ id: 'w', trackingType: 'quantity', target: 2.5, unit: 'L', category: 'hydration' });
  const read = habit({ id: 'r' });
  const logs: LogIndex = { [TODAY]: { w: 1.5, r: 1 } };
  const p = dayProgress([water, read], logs, TODAY);
  assert.equal(p.scheduled, 2);
  assert.equal(p.completed, 1);
  assert.equal(p.ratio, 0.8);
  // 0.1 + 0.2 debe contar como 0.3
  const tiny = habit({ id: 't', trackingType: 'quantity', target: 0.3, unit: 'L' });
  assert.equal(dayProgress([tiny], { [TODAY]: { t: 0.1 + 0.2 } }, TODAY).completed, 1);
});

test('textos de progreso por tipo', () => {
  const water = habit({ trackingType: 'quantity', target: 2.5, unit: 'L' });
  assert.equal(describeProgress(water, 1.5), '1.5 / 2.5 L');
  assert.equal(describeRemaining(water, 1.5), 'faltan 1 L');
  const gym = habit({ trackingType: 'duration', target: 60 });
  assert.equal(describeProgress(gym, 60), '60 / 60 min');
  assert.equal(describeRemaining(gym, 60), null);
  assert.equal(describeRemaining(gym, 15), 'faltan 45 min');
  const walk = habit({ trackingType: 'count', target: 2 });
  assert.equal(describeProgress(walk, 1), '1 / 2 veces');
  const glasses = habit({ trackingType: 'count', target: 8, unit: 'vasos' });
  assert.equal(describeProgress(glasses, 2), '2 / 8 vasos');
  assert.equal(describeRemaining(glasses, 2), 'faltan 6 vasos');
  assert.equal(describeProgress(habit(), 0), 'Pendiente');
});

test('no cuenta días anteriores al inicio ni hábitos archivados', () => {
  const h = habit({ startDate: '2026-11-19' });
  assert.equal(isScheduledOn(h, '2026-11-18'), false);
  assert.equal(dayProgress([habit({ archived: true, pauses: [{ from: '2026-11-01', to: null, reason: 'archive' }] })], {}, TODAY).scheduled, 0);
});

test('estadísticas por hábito: hoy pendiente no penaliza', () => {
  const logs = logsFor('h1', ['2026-11-18', '2026-11-19']);
  const s = habitStats(habit(), logs, '2026-11-17', TODAY, TODAY);
  assert.equal(s.scheduledDays, 3);
  assert.equal(s.completedDays, 2);
});

test('racha de días perfectos', () => {
  const a = habit({ id: 'a' });
  const b = habit({ id: 'b', frequency: 'weekly', daysOfWeek: [1, 3, 5] });
  const logs: LogIndex = {
    '2026-11-16': { a: 1 }, // lunes: falta b → rompe
    '2026-11-17': { a: 1 },
    '2026-11-18': { a: 1, b: 1 },
    '2026-11-19': { a: 1 },
  };
  assert.equal(perfectDayStreak([a, b], logs, TODAY), 3);
});

test('próximo hábito: el más cercano con hora, luego sin hora', () => {
  const morning = habit({ id: 'm', suggestedTime: '07:00' });
  const evening = habit({ id: 'e', suggestedTime: '19:00' });
  const anytime = habit({ id: 'x' });
  const now = timeToMinutes('12:00');
  assert.equal(nextHabit([morning, evening, anytime], {}, TODAY, now)?.id, 'e');
  assert.equal(nextHabit([morning, anytime], {}, TODAY, now)?.id, 'x');
  assert.equal(nextHabit([morning], { [TODAY]: { m: 1 } }, TODAY, now), null);
});

test('hidratación: el módulo de agua alimenta el hábito', () => {
  const w = habit({ id: 'w', category: 'hydration', trackingType: 'quantity', unit: 'L', target: 2.5 });
  assert.equal(isWaterHabit(w), true);
  assert.equal(isWaterHabit({ ...w, unit: 'vasos' }), false);
  const logs: WaterLog[] = [
    { ...META, id: '1', date: TODAY, amountMl: 250 },
    { ...META, id: '2', date: TODAY, amountMl: 500 },
    { ...META, id: '3', date: '2026-11-19', amountMl: 2500 },
    { ...META, id: '4', date: TODAY, amountMl: 999, deletedAt: 'x' },
  ];
  const totals = waterTotals(logs);
  assert.equal(totals[TODAY], 750);
  const idx = mergeWaterIntoIndex({}, [w], totals);
  assert.equal(idx[TODAY].w, 0.75);
  assert.equal(currentStreak(w, idx, TODAY), 1); // ayer 2.5 L cumplido, hoy pendiente
});

test('franjas de recordatorio de agua', () => {
  assert.deepEqual(waterReminderSlots(540, 720, 60), [540, 600, 660, 720]);
  assert.deepEqual(waterReminderSlots(540, 720, 5), []);
});

test('sueño que cruza la medianoche', () => {
  const w = computeSleepWindow('2026-11-20', '23:30', '07:15');
  assert.equal(w.durationMinutes, 465);
  assert.equal(new Date(w.bedtimeAt).getDate(), 19);
});

test('siesta o acostarse después de medianoche', () => {
  assert.equal(computeSleepWindow('2026-11-20', '01:00', '08:00').durationMinutes, 420);
  assert.equal(computeSleepWindow('2026-11-20', '14:00', '15:30').durationMinutes, 90);
});

test('resumen de sueño promedia bien alrededor de medianoche', () => {
  const mk = (date: string, bed: string, wake: string): SleepLog => ({
    ...META,
    id: date,
    date,
    quality: 4,
    notes: null,
    latencyMinutes: 0,
    source: 'manual',
    externalId: null,
    ...computeSleepWindow(date, bed, wake),
  });
  const logs = [mk('2026-11-19', '23:30', '07:30'), mk('2026-11-20', '00:30', '07:30')];
  const s = summarizeSleep(logs, 480);
  assert.equal(s.avgBedtimeOffset, 0);
  assert.equal(s.avgMinutes, 450);
  assert.equal(s.goalHitRate, 0.5);
  assert.equal(bedtimeOffset(logs[0].bedtimeAt), -30);
});

test('overview y rendimiento semanal', () => {
  const logs = logsFor('h1', ['2026-11-18', '2026-11-19']);
  const o = overview([habit()], logs, TODAY, 3, TODAY);
  assert.equal(o.completionRate, 1);
  assert.equal(o.perfectDays, 2);
  const wp = weekdayPerformance([habit()], logs, TODAY, 7, TODAY);
  assert.equal(wp[3], 1);
  assert.equal(wp[6], 0);
});
