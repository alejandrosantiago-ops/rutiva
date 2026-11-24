import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { repositories } from '@/data/repositories';
import { describeBackup, parseBackup } from '@/data/backup';
import type { BackupPayload } from '@/data/repositories';
import { cancelAllNotifications } from '@/services/notifications';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useWaterStore } from '@/features/water/store/useWaterStore';
import { useTimerStore } from '@/features/habits/store/timer';
import { useSleepSessionStore } from '@/features/sleep/store/sleepSession';
import { useWakeStore } from '@/features/alarm/store/useWakeStore';
import { syncWaterReminders } from '@/features/water/store/waterReminders';
import { syncBedtimeReminder } from '@/features/sleep/store/bedtimeReminder';

/** Exporta todos los datos a un archivo .json y abre el menú de compartir. */
export async function exportBackupFile(): Promise<'shared' | 'downloaded'> {
  const payload = await repositories.exportAll();
  const json = JSON.stringify(payload, null, 2);
  const name = `rutiva-${payload.exportedAt.slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    return 'downloaded';
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Guardar copia de seguridad de Rutiva', UTI: 'public.json' });
  return 'shared';
}

/** Abre el selector de archivos y valida la copia elegida (sin importarla todavía). */
export async function pickBackup(): Promise<{ backup: BackupPayload; summary: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
  const backup = parseBackup(text);
  return { backup, summary: describeBackup(backup) };
}

/** Sustituye los datos por los de la copia y lo reprograma todo. */
export async function applyBackup(backup: BackupPayload): Promise<void> {
  // Los avisos ya programados pertenecen a los datos que se van a sustituir.
  await cancelAllNotifications();
  await repositories.importAll(backup);
  useSettingsStore.getState().reset();
  await useSettingsStore.getState().load();
  // Quien importa una copia ya conoce la app.
  await useSettingsStore.getState().update('onboarded', true);
  await Promise.all([
    useHabitStore.getState().load(),
    useSleepStore.getState().load(),
    useWaterStore.getState().load(),
    useSleepSessionStore.getState().load(),
    useWakeStore.getState().load(),
  ]);
  await useTimerStore.getState().load();
  if (useSettingsStore.getState().settings.notificationsEnabled) {
    await Promise.all([
      useHabitStore.getState().rescheduleAll(),
      useWakeStore.getState().rescheduleAll(),
      syncWaterReminders(),
      syncBedtimeReminder(),
    ]).catch(() => undefined);
  }
}
