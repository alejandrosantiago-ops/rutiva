import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromKey, rangeKeys, shiftKey, toKey, todayKey, weekdayOf } from '../src/domain/dates.ts';
import { computeSleepWindow, sleepDateOf } from '../src/domain/sleep.ts';
import { isScheduledOn } from '../src/domain/habits.ts';
import { planHabitReminders } from '../src/domain/reminders.ts';
import type { Habit } from '../src/domain/types.ts';

/*
 * Node relee process.env.TZ al cambiarlo, así que se puede probar la misma
 * lógica en varias zonas horarias, incluidas las que cambian de hora.
 */
const ZONES = ['America/Lima', 'Europe/Madrid', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];

function withTZ(tz: string, fn: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = previous;
  }
}

const META = { createdAt: '', updatedAt: '', deletedAt: null };
const habit = (over: Partial<Habit> = {}): Habit => ({
  ...META,
  id: 'h',
  name: 'x',
  description: null,
  category: 'custom',
  icon: 'target',
  color: '#000',
  trackingType: 'check',
  target: 1,
  unit: null,
  frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  intervalDays: 1,
  startDate: '2026-01-01',
  endDate: null,
  suggestedTime: null,
  reminderTimes: [],
  notificationIds: [],
  pauses: [],
  scheduleHistory: [],
  archived: false,
  sortOrder: 0,
  ...over,
});

test('las zonas horarias se aplican de verdad en este entorno', () => {
  let lima = 0;
  let tokyo = 0;
  withTZ('America/Lima', () => (lima = new Date(2026, 0, 1).getTimezoneOffset()));
  withTZ('Asia/Tokyo', () => (tokyo = new Date(2026, 0, 1).getTimezoneOffset()));
  assert.equal(lima, 300);
  assert.equal(tokyo, -540);
});

for (const tz of ZONES) {
  test(`fechas locales en ${tz}`, () =>
    withTZ(tz, () => {
      // El día cambia a medianoche LOCAL, no en UTC.
      assert.equal(todayKey(new Date(2026, 10, 20, 23, 59)), '2026-11-20');
      assert.equal(todayKey(new Date(2026, 10, 21, 0, 1)), '2026-11-21');
      // Ida y vuelta sin desplazarse un día.
      for (const key of ['2026-01-01', '2026-03-08', '2026-03-29', '2026-04-05', '2026-09-27', '2026-10-25', '2026-11-01', '2026-12-31']) {
        assert.equal(toKey(fromKey(key)), key);
        assert.equal(shiftKey(shiftKey(key, 1), -1), key);
      }
      // Semanas que incluyen cambios de hora: 7 días distintos y consecutivos.
      for (const start of ['2026-03-26', '2026-10-22', '2026-03-05', '2026-10-29', '2026-04-02', '2026-09-24']) {
        const week = rangeKeys(start, shiftKey(start, 6));
        assert.equal(new Set(week).size, 7);
        assert.equal(week[6], shiftKey(start, 6));
      }
      // El día de la semana no depende de la zona.
      assert.equal(weekdayOf('2026-11-20'), 5);
      assert.equal(weekdayOf('2026-03-29'), 0);
      // Repetición semanal e intervalos estables alrededor del cambio de hora.
      const lmv = habit({ frequency: 'weekly', daysOfWeek: [1, 3, 5] });
      assert.deepEqual(
        rangeKeys('2026-03-27', '2026-04-03').filter((d) => isScheduledOn(lmv, d)),
        ['2026-03-27', '2026-03-30', '2026-04-01', '2026-04-03'],
      );
      const every3 = habit({ frequency: 'interval', intervalDays: 3, startDate: '2026-10-20' });
      assert.deepEqual(
        rangeKeys('2026-10-20', '2026-10-31').filter((d) => isScheduledOn(every3, d)),
        ['2026-10-20', '2026-10-23', '2026-10-26', '2026-10-29'],
      );
      // Sueño normal que cruza medianoche: 8 h en cualquier zona (fuera de cambios de hora).
      const w = computeSleepWindow('2026-11-20', '23:00', '07:00');
      assert.equal(w.durationMinutes, 480);
      assert.equal(sleepDateOf(w.wakeAt), '2026-11-20');
    }));
}

test('Europe/Madrid: la noche del cambio de hora dura lo que de verdad duró', () =>
  withTZ('Europe/Madrid', () => {
    // 25 oct 2026: a las 03:00 se vuelve a las 02:00 → una hora más.
    assert.equal(computeSleepWindow('2026-10-25', '23:00', '07:00').durationMinutes, 540);
    // 29 mar 2026: a las 02:00 se salta a las 03:00 → una hora menos.
    assert.equal(computeSleepWindow('2026-03-29', '23:00', '07:00').durationMinutes, 420);
  }));

test('recordatorios por fecha a la hora local correcta tras el cambio de hora', () =>
  withTZ('Europe/Madrid', () => {
    const h = habit({ frequency: 'interval', intervalDays: 1, endDate: '2026-11-05', reminderTimes: ['09:00'] });
    const plan = planHabitReminders(h, new Date(2026, 9, 23, 12, 0)); // 23 oct, antes del cambio
    const dates = plan.map((p) => (p.trigger.type === 'date' ? p.trigger.at : null)!);
    assert.equal(dates.length, 13); // 24 oct … 5 nov
    for (const d of dates) {
      assert.equal(d.getHours(), 9, `${d.toISOString()} debe ser a las 09:00 locales`);
      assert.equal(d.getMinutes(), 0);
    }
  }));
