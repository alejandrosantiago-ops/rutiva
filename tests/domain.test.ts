import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestStreak, currentStreak, dayProgress, describeFrequency, habitStats, isScheduledOn } from '../src/domain/habits.ts';
import { computeSleepWindow, summarizeSleep, bedtimeOffset } from '../src/domain/sleep.ts';
import { minutesToTime, rangeKeys, shiftKey, timeToMinutes } from '../src/domain/dates.ts';
import { overview, weekdayPerformance } from '../src/domain/stats.ts';
import type { Habit, LogIndex, SleepLog } from '../src/domain/types.ts';

const META = { createdAt: '', updatedAt: '', deletedAt: null };

function habit(over: Partial<Habit> = {}): Habit {
  return {
    ...META,
    id: 'h1',
    name: 'Leer',
    description: null,
    icon: 'book',
    color: '#5B5BD6',
    frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    targetPerDay: 1,
    unit: null,
    reminderEnabled: false,
    reminderTime: null,
    notificationIds: [],
    archived: false,
    sortOrder: 0,
    startDate: '2026-11-01',
    ...over,
  };
}

function logsFor(id: string, dates: string[], count = 1): LogIndex {
  const idx: LogIndex = {};
  for (const d of dates) idx[d] = { ...(idx[d] ?? {}), [id]: count };
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

test('racha ignora días no programados', () => {
  // Lunes, miércoles y viernes. 16=lun, 18=mié, 20=vie.
  const h = habit({ frequency: 'custom', daysOfWeek: [1, 3, 5] });
  const logs = logsFor('h1', ['2026-11-16', '2026-11-18', '2026-11-20']);
  assert.equal(currentStreak(h, logs, TODAY), 3);
  assert.equal(isScheduledOn(h, '2026-11-19'), false);
});

test('mejor racha', () => {
  const logs = logsFor('h1', ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
  assert.equal(bestStreak(habit(), logs, TODAY), 3);
});

test('meta por día: progreso parcial', () => {
  const water = habit({ id: 'w', targetPerDay: 4 });
  const read = habit({ id: 'r' });
  const logs: LogIndex = { [TODAY]: { w: 2, r: 1 } };
  const p = dayProgress([water, read], logs, TODAY);
  assert.equal(p.scheduled, 2);
  assert.equal(p.completed, 1);
  assert.equal(p.ratio, 0.75);
});

test('no cuenta días anteriores al inicio ni hábitos archivados', () => {
  const h = habit({ startDate: '2026-11-19' });
  assert.equal(isScheduledOn(h, '2026-11-18'), false);
  assert.equal(dayProgress([habit({ archived: true })], {}, TODAY).scheduled, 0);
});

test('estadísticas por hábito: hoy pendiente no penaliza', () => {
  const logs = logsFor('h1', ['2026-11-18', '2026-11-19']);
  const s = habitStats(habit(), logs, '2026-11-17', TODAY, TODAY);
  assert.equal(s.scheduledDays, 3);
  assert.equal(s.completedDays, 2);
});

test('describeFrequency', () => {
  assert.equal(describeFrequency({ frequency: 'custom', daysOfWeek: [1, 2, 3, 4, 5] }), 'Entre semana');
  assert.equal(describeFrequency({ frequency: 'custom', daysOfWeek: [6, 0] }), 'Fines de semana');
  assert.equal(describeFrequency({ frequency: 'custom', daysOfWeek: [3, 1] }), 'Lun · Mié');
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
    ...computeSleepWindow(date, bed, wake),
  });
  const logs = [mk('2026-11-19', '23:30', '07:30'), mk('2026-11-20', '00:30', '07:30')];
  const s = summarizeSleep(logs, 480);
  assert.equal(s.avgBedtimeOffset, 0); // medianoche, no mediodía
  assert.equal(s.avgMinutes, 450);
  assert.equal(s.goalHitRate, 0.5);
  assert.equal(bedtimeOffset(logs[0].bedtimeAt), -30);
});

test('overview y rendimiento semanal', () => {
  const logs = logsFor('h1', ['2026-11-18', '2026-11-19']);
  const o = overview([habit()], logs, TODAY, 3, TODAY);
  assert.equal(o.completionRate, 1); // hoy pendiente se excluye
  assert.equal(o.perfectDays, 2);
  const wp = weekdayPerformance([habit()], logs, TODAY, 7, TODAY);
  assert.equal(wp[3], 1); // miércoles 18
  assert.equal(wp[6], 0); // sábado 14 sin registro
});
