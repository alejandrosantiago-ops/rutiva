import { Platform, requireOptionalNativeModule } from 'expo';

interface RutivaAlarmNative {
  isAvailable(): boolean;
  setAlarm(hour: number, minute: number, days: number[], label: string, vibrate: boolean, skipUi: boolean): Promise<boolean>;
  showAlarms(): Promise<boolean>;
}

/**
 * Módulo nativo para alarmas del Reloj de Android. Es `null` en iOS, en web y
 * en Expo Go (que no incluye código nativo propio): ahí la app usa el modo
 * "Rutiva" basado en notificaciones.
 */
const native = Platform.OS === 'android' ? requireOptionalNativeModule<RutivaAlarmNative>('RutivaAlarm') : null;

export const systemAlarms = {
  /** ¿Se pueden crear alarmas en el Reloj del sistema desde esta instalación? */
  supported(): boolean {
    try {
      return !!native && native.isAvailable();
    } catch {
      return false;
    }
  },
  /** `weekdays`: 0 = domingo … 6 = sábado (como Date#getDay). */
  async create(opts: { hour: number; minute: number; weekdays: number[]; label: string; vibrate?: boolean; skipUi?: boolean }) {
    if (!native) return false;
    const calendarDays = opts.weekdays.length === 7 ? [1, 2, 3, 4, 5, 6, 7] : opts.weekdays.map((d) => d + 1);
    return native.setAlarm(opts.hour, opts.minute, calendarDays, opts.label, opts.vibrate ?? true, opts.skipUi ?? true);
  },
  async show() {
    return native ? native.showAlarms() : false;
  },
};
