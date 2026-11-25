import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHealthConnect } from '../src/services/health/mapping.ts';
import type { ExternalSleepSession } from '../src/services/health/types.ts';
import type { SleepLog } from '../src/domain/types.ts';

import { planSleepImport } from '../src/services/health/plan.ts';

test('Health Connect: convierte la sesión y descuenta el tiempo despierto', () => {
  const s = fromHealthConnect({
    startTime: '2026-11-19T23:00:00.000-05:00',
    endTime: '2026-11-20T07:00:00.000-05:00',
    metadata: { id: 'abc' },
    stages: [
      { startTime: '2026-11-19T23:00:00.000-05:00', endTime: '2026-11-19T23:20:00.000-05:00', stage: 1 }, // despierto 20 min
      { startTime: '2026-11-19T23:20:00.000-05:00', endTime: '2026-11-20T06:50:00.000-05:00', stage: 4 },
      { startTime: '2026-11-20T06:50:00.000-05:00', endTime: '2026-11-20T07:00:00.000-05:00', stage: 3 }, // fuera de la cama 10 min
    ],
  })!;
  assert.equal(s.externalId, 'hc:abc');
  assert.equal(s.awakeMinutes, 30);
  assert.equal(s.start, '2026-11-20T04:00:00.000Z');
  assert.equal(fromHealthConnect({ startTime: '2026-11-20T00:00:00Z', endTime: '2026-11-20T00:00:00Z', metadata: { id: 'x' } }), null);
  assert.equal(fromHealthConnect({ startTime: '2026-11-19T00:00:00Z', endTime: '2026-11-20T08:00:00Z' }), null, 'sin id no se puede deduplicar');
});

test('importación: no duplica, no pisa registros manuales y se queda la sesión más larga', () => {
  const META = { createdAt: '', updatedAt: '', deletedAt: null };
  const log = (date: string, source: SleepLog['source'], externalId: string | null = null): SleepLog => ({
    ...META,
    id: date + source,
    date,
    bedtimeAt: '',
    wakeAt: '',
    latencyMinutes: 0,
    durationMinutes: 480,
    quality: 3,
    notes: null,
    source,
    externalId,
  });
  const session = (id: string, start: string, end: string): ExternalSleepSession => ({ externalId: id, start, end, awakeMinutes: 0 });
  const existing = [log('2026-11-18', 'manual'), log('2026-11-17', 'health_connect', 'hc:old')];
  const { inputs, skipped } = planSleepImport(
    [
      session('hc:old', '2026-11-16T23:00:00', '2026-11-17T07:00:00'), // ya importada
      session('hc:m', '2026-11-17T23:00:00', '2026-11-18T07:00:00'), // ese día hay un registro manual
      session('hc:nap', '2026-11-19T14:00:00', '2026-11-19T15:00:00'), // siesta
      session('hc:night', '2026-11-18T23:30:00', '2026-11-19T07:30:00'), // noche: más larga, gana
    ],
    existing,
    'health_connect',
  );
  assert.deepEqual(inputs.map((i) => i.externalId), ['hc:night']);
  assert.equal(inputs[0].source, 'health_connect');
  assert.equal(skipped, 3);
});
