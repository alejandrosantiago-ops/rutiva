import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bestPerfectDayStreak,
  currentStreak,
  dayProgress,
  habitOn,
  habitsForDay,
  isDoneOn,
  isScheduledOn,
  nextScheduleHistory,
  perfectDayStreak,
} from '../src/domain/habits.ts';
import { activityGrid, compliance, habitRanking, minutesByCategory, weeklySeries } from '../src/domain/stats.ts';
import { compareWithGoal, sleepDateOf, sleepDuration, sleepProblem } from '../src/domain/sleep.ts';
import type { Habit, LogIndex, SleepLog } from '../src/domain/types.ts';

const META = { createdAt: '', updatedAt: '', deletedAt: null };
const TODAY = '2026-11-20'; // viernes

function habit(over: Partial<Habit> = {}): Habit {
  return {
    ...META,
    id: 'h1',
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

test('cambiar la programación no reescribe el pasado', () => {
  const h = habit();
  // El día 18 pasa de diario a solo lunes/miércoles/viernes.
  const history = nextScheduleHistory(h, { frequency: 'weekly', daysOfWeek: [1, 3, 5] }, '2026-11-18');
  assert.deepEqual(history, [{ until: '2026-11-17', frequency: 'daily', daysOfWeek: h.daysOfWeek, intervalDays: 1, target: 1 }]);
  const edited: Habit = { ...h, frequency: 'weekly', daysOfWeek: [1, 3, 5], scheduleHistory: history };
  assert.equal(isScheduledOn(edited, '2026-11-15'), true, 'domingo 15: antes era diario');
  assert.equal(isScheduledOn(edited, '2026-11-19'), false, 'jueves 19: ya no toca');
  assert.equal(isScheduledOn(edited, '2026-11-20'), true, 'viernes 20: toca');
});

test('cambiar la meta conserva la meta antigua en días pasados', () => {
  const h = habit({ trackingType: 'quantity', target: 2, unit: 'L' });
  const edited: Habit = { ...h, target: 3, scheduleHistory: nextScheduleHistory(h, { target: 3 }, TODAY) };
  const logs: LogIndex = { '2026-11-19': { h1: 2 }, [TODAY]: { h1: 2 } };
  assert.equal(isDoneOn(edited, logs, '2026-11-19'), true);
  assert.equal(isDoneOn(edited, logs, TODAY), false);
  assert.equal(habitOn(edited, '2026-11-19').target, 2);
});

test('editar dos veces el mismo día guarda una sola regla anterior', () => {
  const h = habit();
  const h1: Habit = { ...h, target: 2, trackingType: 'count', scheduleHistory: nextScheduleHistory(h, { target: 2 }, TODAY) };
  const history = nextScheduleHistory(h1, { target: 5 }, TODAY);
  assert.equal(history.length, 1);
  assert.equal(history[0].target, 1);
  // Un hábito que empieza hoy no necesita historial.
  assert.deepEqual(nextScheduleHistory(habit({ startDate: TODAY }), { target: 9 }, TODAY), []);
});

test('archivar (pausa desde ese día) conserva el historial anterior', () => {
  const archived = habit({ archived: true, pauses: [{ from: '2026-11-19', to: null, reason: 'archive' }] });
  assert.equal(habitsForDay([archived], '2026-11-18').length, 1);
  assert.equal(habitsForDay([archived], TODAY).length, 0);
  assert.equal(habitsForDay([habit({ deletedAt: 'x' })], '2026-11-18').length, 0, 'los eliminados no aparecen');
});

test('mejor racha histórica de días perfectos', () => {
  const logs: LogIndex = {};
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-10', '2026-11-19']) logs[d] = { h1: 1 };
  assert.equal(bestPerfectDayStreak([habit()], logs, TODAY), 4);
  assert.equal(perfectDayStreak([habit()], logs, TODAY), 1);
});

test('cumplimiento: no cuenta días previos a la creación', () => {
  const late = habit({ id: 'late', startDate: '2026-11-18' });
  const logs: LogIndex = { '2026-11-18': { late: 1 }, '2026-11-19': { late: 1 } };
  const c = compliance([late], logs, '2026-11-01', TODAY, TODAY);
  assert.equal(c.scheduled, 2);
  assert.equal(c.rate, 1);
  const ranking = habitRanking([late, habit({ id: 'future', startDate: '2026-12-01' })], logs, TODAY, 30, TODAY);
  assert.deepEqual(
    ranking.map((r) => r.habit.id),
    ['late'],
    'sin días programados no entra en el ranking',
  );
});

test('cumplimiento semanal y cuadrícula de actividad', () => {
  const logs: LogIndex = { '2026-11-16': { h1: 1 }, '2026-11-17': { h1: 1 } };
  const weeks = weeklySeries([habit({ startDate: '2026-11-16' })], logs, TODAY, 2, 1);
  assert.equal(weeks[0].rate, null, 'semana anterior al inicio');
  assert.equal(weeks[1].start, '2026-11-16');
  assert.equal(weeks[1].rate, 0.5); // 16 y 17 sí; 18 y 19 no; hoy pendiente no cuenta
  const grid = activityGrid([habit({ startDate: '2026-11-16' })], logs, TODAY, 2, 1);
  assert.equal(grid.length, 2);
  assert.equal(grid[1][0].ratio, 1);
  assert.equal(grid[1][6].ratio, null, 'domingo futuro');
});

test('minutos por categoría (entrenamiento y estudio)', () => {
  const gym = habit({ id: 'g', category: 'exercise', trackingType: 'duration', target: 60 });
  const code = habit({ id: 'c', category: 'study', trackingType: 'duration', target: 30 });
  const logs: LogIndex = { '2026-11-19': { g: 45, c: 30 }, [TODAY]: { g: 60 } };
  assert.equal(minutesByCategory([gym, code], logs, 'exercise', '2026-11-14', TODAY).minutes, 105);
  assert.equal(minutesByCategory([gym, code], logs, 'study', '2026-11-14', TODAY).minutes, 30);
});

test('sueño: duración con latencia, validación y fecha', () => {
  const bed = new Date(2026, 10, 19, 23, 10).toISOString();
  const wake = new Date(2026, 10, 20, 7, 0).toISOString();
  assert.equal(sleepDuration(bed, wake), 470);
  assert.equal(sleepDuration(bed, wake, 20), 450);
  assert.equal(sleepProblem(bed, wake, 20), null);
  assert.match(sleepProblem(wake, bed) ?? '', /posterior/);
  assert.match(sleepProblem(bed, wake, 600) ?? '', /tiempo en cama/);
  assert.equal(sleepDateOf(wake), TODAY);
});

test('sueño: comparación con la meta', () => {
  const mk = (min: number): SleepLog => ({
    ...META,
    id: String(min),
    date: TODAY,
    bedtimeAt: '',
    wakeAt: '',
    latencyMinutes: 0,
    durationMinutes: min,
    quality: 3,
    notes: null,
    source: 'manual',
    externalId: null,
  });
  const c = compareWithGoal([mk(420), mk(480), mk(510)], 480);
  assert.equal(c.diffMinutes, -10);
  assert.equal(c.debtMinutes, 60);
});

test('la racha respeta la meta antigua', () => {
  const h = habit({ trackingType: 'count', target: 1 });
  const edited: Habit = { ...h, target: 3, scheduleHistory: nextScheduleHistory(h, { target: 3 }, TODAY) };
  const logs: LogIndex = { '2026-11-18': { h1: 1 }, '2026-11-19': { h1: 1 } };
  assert.equal(currentStreak(edited, logs, TODAY), 2);
  assert.equal(dayProgress([edited], logs, '2026-11-19').completed, 1);
});
