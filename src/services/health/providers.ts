import { Platform } from 'react-native';
import { fromHealthConnect, type HealthConnectSleepRecord } from './mapping';
import type { ExternalSleepSession, HealthAvailability, HealthProvider } from './types';

/*
 * Health Connect (Android): implementación real con react-native-health-connect.
 * - Solo se pide el permiso de LECTURA de sesiones de sueño, y solo cuando la
 *   persona pulsa "Importar".
 * - La librería es código nativo: no existe en Expo Go ni en web. Se carga
 *   bajo demanda para que la app no falle allí y muestre un aviso.
 *
 * HealthKit (iOS): preparado pero sin activar. Requiere
 * `@kingstinct/react-native-healthkit` (+ react-native-nitro-modules), el
 * permiso NSHealthShareUsageDescription y compilar en un Mac. Al activarlo
 * basta con implementar `readSleepSessions` con HKCategoryTypeIdentifierSleepAnalysis.
 */

type HealthConnectLib = typeof import('react-native-health-connect');

function loadHealthConnect(): HealthConnectLib | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HealthConnectLib;
  } catch {
    return null;
  }
}

const SLEEP_PERMISSION = { accessType: 'read', recordType: 'SleepSession' } as const;

export const healthConnect: HealthProvider = {
  source: 'health_connect',
  name: 'Health Connect',

  async availability(): Promise<HealthAvailability> {
    if (Platform.OS !== 'android') return { available: false, reason: 'unsupported-platform' };
    const hc = loadHealthConnect();
    if (!hc) return { available: false, reason: 'needs-dev-build' };
    try {
      const status = await hc.getSdkStatus();
      if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return { available: true };
      return { available: false, reason: 'not-installed' };
    } catch {
      // En Expo Go el módulo JS existe pero el nativo no.
      return { available: false, reason: 'needs-dev-build' };
    }
  },

  async requestSleepPermission() {
    const hc = loadHealthConnect();
    if (!hc) return false;
    await hc.initialize();
    const granted = await hc.requestPermission([SLEEP_PERMISSION]);
    return granted.some((p) => 'recordType' in p && p.recordType === 'SleepSession' && p.accessType === 'read');
  },

  async readSleepSessions(from, to) {
    const hc = loadHealthConnect();
    if (!hc) return [];
    const out: ExternalSleepSession[] = [];
    let pageToken: string | undefined;
    do {
      const page = await hc.readRecords('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
        pageToken,
      });
      for (const r of page.records) {
        const session = fromHealthConnect(r as unknown as HealthConnectSleepRecord);
        if (session) out.push(session);
      }
      pageToken = page.pageToken || undefined;
    } while (pageToken);
    return out;
  },
};

export const healthKit: HealthProvider = {
  source: 'healthkit',
  name: 'Apple Salud',
  async availability() {
    return Platform.OS === 'ios' ? { available: false, reason: 'needs-dev-build' } : { available: false, reason: 'unsupported-platform' };
  },
  async requestSleepPermission() {
    return false;
  },
  async readSleepSessions() {
    return [];
  },
};

/** Proveedor de salud de la plataforma actual, si existe. */
export function platformHealthProvider(): HealthProvider | null {
  if (Platform.OS === 'android') return healthConnect;
  if (Platform.OS === 'ios') return healthKit;
  return null;
}

export const AVAILABILITY_MESSAGES: Record<Exclude<HealthAvailability, { available: true }>['reason'], string> = {
  'unsupported-platform': 'No disponible en este dispositivo.',
  'not-installed': 'Instala o actualiza la app Health Connect desde Google Play y vuelve a intentarlo.',
  'needs-dev-build': 'Requiere la versión instalable de Rutiva (no funciona en Expo Go).',
};
