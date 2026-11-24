import { applyBackup, exportBackupFile, pickBackup } from '@/features/settings/backupActions';
import { useWakeStore } from '@/features/alarm/store/useWakeStore';
import { toast } from '@/ui/toast';
import { useTimerStore } from '@/features/habits/store/timer';
import { useSleepSessionStore } from '@/features/sleep/store/sleepSession';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { confirmAction, showAlert, showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import {
  Bell,
  BellRing,
  CalendarDays,
  ChevronLeft,
  AlarmClock,
  Download,
  Upload,
  Droplets,
  Info,
  Moon,
  Palette,
  RotateCcw,
  Smartphone,
  Target,
} from 'lucide-react-native';
import { formatDurationShort } from '@/domain/dates';
import type { ThemeMode } from '@/domain/types';
import { repositories } from '@/data/repositories';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useWaterStore } from '@/features/water/store/useWaterStore';
import { syncWaterReminders } from '@/features/water/store/waterReminders';
import { syncBedtimeReminder } from '@/features/sleep/store/bedtimeReminder';
import { router } from 'expo-router';
import { formatWater } from '@/domain/water';
import {
  cancelAllNotifications,
  getPermissionStatus,
  notificationsSupported,
  sendTestNotification,
} from '@/services/notifications';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { Card, IconButton, Txt } from '@/ui/primitives';
import { FieldLabel, ListRow, Segmented, Stepper, TextField, TimeField, Toggle } from '@/ui/form';


export default function SettingsScreen() {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [name, setName] = useState(settings.userName);
  const [permission, setPermission] = useState<string>('undetermined');
  const wakeCount = useWakeStore((s) => s.alarms.length);

  useEffect(() => {
    getPermissionStatus().then(setPermission);
  }, [settings.notificationsEnabled]);

  // Los ajustes ya se guardaron antes de llamar; el helper lee el estado actual.
  const syncBedtime = async (..._args: unknown[]) => {
    if (!(await syncBedtimeReminder())) showAlert('Permiso necesario', 'Activa las notificaciones de Rutiva en los ajustes del sistema.');
  };

  const toggleNotifications = async (on: boolean) => {
    await update('notificationsEnabled', on);
    if (!on) await cancelAllNotifications();
    await useHabitStore.getState().rescheduleAll();
    await syncBedtime();
    await syncWaterReminders();
    await useWakeStore.getState().rescheduleAll();
    setPermission(await getPermissionStatus());
  };

  const exportData = async () => {
    try {
      const how = await exportBackupFile();
      toast(how === 'downloaded' ? 'Copia descargada' : 'Copia lista para guardar');
    } catch (e) {
      showError('No se pudo exportar', e);
    }
  };

  const importData = async () => {
    try {
      const picked = await pickBackup();
      if (!picked) return;
      confirmAction(
        'Importar copia',
        `La copia contiene ${picked.summary}. Sustituirá TODOS los datos actuales de este dispositivo.`,
        'Importar',
        async () => {
          try {
            await applyBackup(picked.backup);
            setName(useSettingsStore.getState().settings.userName);
            toast('Copia importada');
          } catch (e) {
            showError('No se pudo importar', e);
          }
        },
      );
    } catch (e) {
      showError('No se pudo leer la copia', e);
    }
  };

  const resetData = () => {
    const msg = 'Se borrarán todos tus hábitos, registros y ajustes de este dispositivo. No se puede deshacer.';
    confirmAction('Restablecer datos', msg, 'Borrar todo', async () => {
      haptics.warning();
      try {
        await cancelAllNotifications();
        await repositories.resetAll();
        useSettingsStore.getState().reset();
        await Promise.all([
          useSettingsStore.getState().load(),
          useHabitStore.getState().load(),
          useSleepStore.getState().load(),
          useWaterStore.getState().load(),
          useTimerStore.getState().load(),
          useSleepSessionStore.getState().load(),
          useWakeStore.getState().load(),
        ]);
        setName('');
        goBack();
      } catch (e) {
        showError('No se pudieron borrar los datos', e);
      }
    });
  };

  const initial = (name.trim()[0] ?? '?').toUpperCase();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <View className="flex-row items-center gap-3 px-5 py-2">
        <IconButton icon={ChevronLeft} label="Volver" onPress={() => goBack()} size={40} />
        <Txt variant="title">Configuración</Txt>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-16" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Perfil */}
        <Card className="mt-3 flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-500 dark:bg-brand-400">
            <Text className="text-[22px] font-bold text-white">{initial}</Text>
          </View>
          <View className="flex-1">
            <Txt variant="caption" className="mb-1">
              ¿Cómo quieres que te llamemos?
            </Txt>
            <TextField
              value={name}
              onChangeText={setName}
              onEndEditing={() => update('userName', name.trim())}
              onBlur={() => update('userName', name.trim())}
              placeholder="Tu nombre"
              maxLength={24}
              className="min-h-[44px] py-2.5"
              returnKeyType="done"
            />
          </View>
        </Card>

        <FieldLabel>Apariencia</FieldLabel>
        <Card>
          <View className="mb-3 flex-row items-center gap-3">
            <Palette size={18} color={t.brand} />
            <Txt variant="label">Tema</Txt>
          </View>
          <Segmented<ThemeMode>
            value={settings.themeMode}
            onChange={(v) => update('themeMode', v)}
            options={[
              { value: 'system', label: 'Sistema' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
        </Card>

        <FieldLabel>Notificaciones</FieldLabel>
        <Card className="py-1">
          <ListRow
            icon={Bell}
            title="Recordatorios"
            subtitle={
              !notificationsSupported
                ? 'Disponibles en Android e iOS'
                : permission === 'denied'
                  ? 'Permiso denegado en los ajustes del sistema'
                  : 'Avisos de hábitos y de la hora de dormir'
            }
            right={<Toggle value={settings.notificationsEnabled} onValueChange={toggleNotifications} />}
          />
          <ListRow
            icon={Moon}
            iconColor={t.sleep}
            title="Recordatorio para dormir"
            subtitle={settings.bedtimeReminderEnabled ? `Todos los días a las ${settings.bedtimeReminderTime}` : 'Desactivado'}
            right={
              <Toggle
                value={settings.bedtimeReminderEnabled}
                onValueChange={async (v) => {
                  await update('bedtimeReminderEnabled', v);
                  await syncBedtime(v, settings.bedtimeReminderTime);
                }}
              />
            }
          />
          <ListRow
            icon={BellRing}
            title="Enviar notificación de prueba"
            last
            onPress={async () => {
              const ok = await sendTestNotification();
              if (!ok) showAlert('Sin permiso', 'No hay permiso para mostrar notificaciones en este dispositivo.');
            }}
          />
        </Card>
        {settings.bedtimeReminderEnabled ? (
          <View className="mt-3">
            <TimeField
              label="Hora del aviso para dormir"
              icon={Moon}
              value={settings.bedtimeReminderTime}
              onChange={async (v) => {
                await update('bedtimeReminderTime', v);
                await syncBedtime(true, v);
              }}
            />
          </View>
        ) : null}

        <FieldLabel>Despertador</FieldLabel>
        <Card className="py-1">
          <ListRow
            icon={AlarmClock}
            iconColor="#F59E0B"
            title="Alarmas para despertar"
            subtitle={wakeCount ? `${wakeCount} ${wakeCount === 1 ? 'alarma' : 'alarmas'}` : 'Configura tu hora de despertar'}
            last
            onPress={() => router.push('/alarms')}
          />
        </Card>

        <FieldLabel>Hidratación</FieldLabel>
        <Card className="py-1">
          <ListRow
            icon={Droplets}
            iconColor="#06B6D4"
            title="Agua"
            subtitle={`Meta ${formatWater(settings.waterGoalMl, settings.waterUnit)} · recordatorios ${settings.waterReminderEnabled ? "activados" : "desactivados"}`}
            last
            onPress={() => router.push("/water")}
          />
        </Card>

        <FieldLabel>Sueño</FieldLabel>
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Target size={18} color={t.sleep} />
              <Txt variant="label">Meta diaria</Txt>
            </View>
            <Stepper
              value={settings.sleepGoalMinutes}
              min={300}
              max={720}
              step={15}
              format={formatDurationShort}
              onChange={(v) => update('sleepGoalMinutes', v)}
            />
          </View>
        </Card>

        <FieldLabel>Preferencias</FieldLabel>
        <Card>
          <View className="mb-3 flex-row items-center gap-3">
            <CalendarDays size={18} color={t.brand} />
            <Txt variant="label">La semana empieza el</Txt>
          </View>
          <Segmented<'1' | '0'>
            value={String(settings.weekStartsOn) as '1' | '0'}
            onChange={(v) => update('weekStartsOn', v === '1' ? 1 : 0)}
            options={[
              { value: '1', label: 'Lunes' },
              { value: '0', label: 'Domingo' },
            ]}
          />
        </Card>
        <Card className="mt-3 py-1">
          <ListRow
            icon={Smartphone}
            title="Vibración al interactuar"
            subtitle="Respuesta háptica sutil"
            last
            right={<Toggle value={settings.hapticsEnabled} onValueChange={(v) => update('hapticsEnabled', v)} />}
          />
        </Card>

        <FieldLabel>Datos</FieldLabel>
        <Card className="py-1">
          <ListRow icon={Download} title="Exportar copia de seguridad" subtitle="Archivo .json con todos tus datos" onPress={exportData} />
          <ListRow icon={Upload} title="Importar copia de seguridad" subtitle="Sustituye los datos por los de un archivo" onPress={importData} />
          <ListRow icon={RotateCcw} title="Restablecer datos" subtitle="Borra todo lo guardado en este dispositivo" destructive last onPress={resetData} />
        </Card>

        <FieldLabel>Acerca de</FieldLabel>
        <Card className="py-1">
          <ListRow
            icon={Info}
            title="Rutiva"
            subtitle={`Versión ${Constants.expoConfig?.version ?? '1.0.0'} · Tus datos se guardan solo en este dispositivo`}
            last
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
