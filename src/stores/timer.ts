import type { ActiveTimer, DateKey } from '@/domain/types';
import { useSettingsStore } from './useSettingsStore';
import { useHabitStore } from './useHabitStore';

/**
 * Cronómetro para hábitos por duración. Solo puede haber uno activo; se guarda
 * en ajustes para que siga contando aunque se cierre la app.
 */
export function elapsedMs(timer: ActiveTimer, now = Date.now()): number {
  return timer.accumulatedMs + (timer.runningSince ? now - new Date(timer.runningSince).getTime() : 0);
}

const save = (timer: ActiveTimer | null) => useSettingsStore.getState().update('activeTimer', timer);
const current = () => useSettingsStore.getState().settings.activeTimer;

export const timer = {
  start(habitId: string, date: DateKey) {
    return save({ habitId, date, runningSince: new Date().toISOString(), accumulatedMs: 0 });
  },
  pause() {
    const t = current();
    if (!t?.runningSince) return;
    return save({ ...t, runningSince: null, accumulatedMs: elapsedMs(t) });
  },
  resume() {
    const t = current();
    if (!t || t.runningSince) return;
    return save({ ...t, runningSince: new Date().toISOString() });
  },
  discard() {
    return save(null);
  },
  /** Detiene el cronómetro y suma los minutos al día en que se inició. Devuelve los minutos añadidos. */
  async finish(): Promise<number> {
    const t = current();
    if (!t) return 0;
    const minutes = Math.round(elapsedMs(t) / 60000);
    await save(null);
    if (minutes > 0) await useHabitStore.getState().addProgress(t.habitId, t.date, minutes);
    return minutes;
  },
};
