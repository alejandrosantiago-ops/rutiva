import { useSettingsStore } from '@/features/settings/store/useSettingsStore';

/**
 * Registro de sueño por temporizador: "Voy a dormir" guarda la hora exacta y
 * "Me desperté" abre el formulario con el intervalo para revisarlo y guardarlo.
 * La sesión vive en ajustes (SQLite), así que sobrevive a cerrar la app.
 *
 * Importante: un temporizador mide tiempo en cama, no detecta el sueño. Los
 * registros creados así se guardan con origen 'timer' y se muestran como
 * "Estimado".
 */
export const sleepSession = {
  start() {
    return useSettingsStore.getState().update('sleepSession', { startedAt: new Date().toISOString() });
  },
  clear() {
    return useSettingsStore.getState().update('sleepSession', null);
  },
};
