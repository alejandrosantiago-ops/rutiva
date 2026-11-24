import type { TimedSession } from './types.ts';

/*
 * Lógica pura de sesiones temporizadas. No guarda nada: recibe el estado y el
 * instante actual y devuelve el nuevo estado. Así se puede probar con relojes
 * simulados y la persistencia vive en el repositorio.
 */

type Clock = number; // ms desde epoch

export function elapsedMs(s: Pick<TimedSession, 'runningSince' | 'accumulatedMs'>, now: Clock): number {
  const live = s.runningSince ? Math.max(0, now - new Date(s.runningSince).getTime()) : 0;
  return s.accumulatedMs + live;
}

export function isActiveSession(s: Pick<TimedSession, 'status'> | null | undefined): boolean {
  return !!s && (s.status === 'running' || s.status === 'paused');
}

export function pauseSession<T extends TimedSession>(s: T, now: Clock): T {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', runningSince: null, accumulatedMs: elapsedMs(s, now) };
}

export function resumeSession<T extends TimedSession>(s: T, now: Clock): T {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', runningSince: new Date(now).toISOString() };
}

/** Termina la sesión. Los minutos se redondean al más cercano. */
export function finishSession<T extends TimedSession>(s: T, now: Clock): T {
  if (!isActiveSession(s)) return s;
  const ms = elapsedMs(s, now);
  return {
    ...s,
    status: 'finished',
    runningSince: null,
    accumulatedMs: ms,
    endedAt: new Date(now).toISOString(),
    resultMinutes: Math.round(ms / 60000),
  };
}

export function discardSession<T extends TimedSession>(s: T, now: Clock): T {
  if (!isActiveSession(s)) return s;
  return { ...s, status: 'discarded', runningSince: null, accumulatedMs: elapsedMs(s, now), endedAt: new Date(now).toISOString() };
}

/** "01:05:09" o "05:09". */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
