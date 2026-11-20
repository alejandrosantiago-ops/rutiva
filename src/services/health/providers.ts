import { Platform } from 'react-native';
import type { HealthProvider } from './types';

/*
 * Adaptadores preparados pero sin activar. Para habilitarlos:
 *
 * Android — Health Connect
 *   npx expo install react-native-health-connect expo-health-connect expo-build-properties
 *   app.json → plugins: "expo-health-connect" y minSdkVersion 26 (expo-build-properties);
 *   permiso: android.permission.health.READ_SLEEP. Implementar con
 *   initialize() / requestPermission([{ accessType: 'read', recordType: 'SleepSession' }])
 *   / readRecords('SleepSession', { timeRangeFilter }).
 *
 * iOS — HealthKit
 *   npx expo install @kingstinct/react-native-healthkit
 *   app.json → plugin con NSHealthShareUsageDescription (texto en español explicando el uso);
 *   leer HKCategoryTypeIdentifierSleepAnalysis (muestras "asleep*", descartando "inBed"/"awake").
 *
 * Ambos requieren un development build (no funcionan en Expo Go).
 */

const notYet = { available: false as const, reason: 'needs-dev-build' as const };

export const healthConnect: HealthProvider = {
  source: 'health_connect',
  name: 'Health Connect',
  async availability() {
    return Platform.OS === 'android' ? notYet : { available: false, reason: 'unsupported-platform' };
  },
  async requestSleepPermission() {
    return false;
  },
  async readSleepSessions() {
    return [];
  },
};

export const healthKit: HealthProvider = {
  source: 'healthkit',
  name: 'Apple Salud',
  async availability() {
    return Platform.OS === 'ios' ? notYet : { available: false, reason: 'unsupported-platform' };
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
