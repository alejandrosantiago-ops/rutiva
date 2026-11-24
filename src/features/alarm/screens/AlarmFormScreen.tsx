import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AlarmClock, BellRing, Check, ExternalLink, Play, Trash } from 'lucide-react-native';
import { orderedWeekdays } from '@/domain/dates';
import { ALL_DAYS } from '@/domain/habits';
import { describeUntil, nextWakeAt, WAKE_SOUNDS } from '@/domain/wake';
import type { WakeAlarmInput, WakeAlarmMode, WakeSound, Weekday } from '@/domain/types';
import { useWakeStore } from '@/features/alarm/store/useWakeStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { testWakeAlarm } from '@/services/notifications/wake';
import { notificationsSupported } from '@/services/notifications';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { confirmAction, showAlert, showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { ModalScreen } from '@/ui/layout';
import { Button, Card, Txt } from '@/ui/primitives';
import { ChipGroup, FieldLabel, ListRow, Segmented, Stepper, TextField, TimeField, Toggle, WeekdayPicker } from '@/ui/form';
import { toast } from '@/ui/toast';
import { systemAlarms } from '../../../../modules/rutiva-alarm';

const DEFAULT: WakeAlarmInput = {
  label: 'Buenos días',
  time: '07:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  enabled: true,
  sound: 'classic',
  snoozeMinutes: 10,
  mode: 'app',
};

export default function AlarmFormScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useWakeStore((s) => s.alarms.find((a) => a.id === id));
  const { save, remove } = useWakeStore.getState();
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);
  const userName = useSettingsStore((s) => s.settings.userName);
  const systemSupported = systemAlarms.supported();
  const [form, setForm] = useState<WakeAlarmInput>(() => {
    if (existing) {
      const { id: _id, notificationIds: _n, ...rest } = existing;
      return rest;
    }
    return { ...DEFAULT, mode: systemSupported ? 'system' : 'app' };
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof WakeAlarmInput>(k: K, v: WakeAlarmInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const next = nextWakeAt(form, new Date());

  const submit = async () => {
    setSaving(true);
    try {
      const { systemCreated } = await save(form, existing?.id);
      haptics.success();
      goBack('/alarms');
      if (systemCreated === false) {
        showAlert('No se pudo crear en el Reloj', 'No se encontró una app de Reloj compatible. Puedes usar el modo «Aviso de Rutiva».');
      } else {
        toast(next && form.enabled ? `Alarma guardada · suena ${describeUntil(next, new Date())}` : 'Alarma guardada');
      }
    } catch (e) {
      showError('No se pudo guardar la alarma', e);
      setSaving(false);
    }
  };

  return (
    <ModalScreen
      title={existing ? 'Editar alarma' : 'Nueva alarma'}
      footer={
        <View className="gap-2">
          <Button title="Guardar alarma" icon={Check} disabled={saving || form.daysOfWeek.length === 0} onPress={submit} />
          {existing ? (
            <Button
              title="Eliminar alarma"
              icon={Trash}
              variant="danger"
              onPress={() =>
                confirmAction('Eliminar alarma', `Se eliminará «${existing.label}».`, 'Eliminar', async () => {
                  const removed = await remove(existing.id);
                  goBack('/alarms');
                  if (removed) {
                    const { id: _i, notificationIds: _n, ...input } = removed;
                    toast('Alarma eliminada', { undo: () => save(input).then(() => undefined) });
                  }
                  if (existing.mode === 'system') toast('Bórrala también en la app Reloj', { tone: 'info' });
                })
              }
            />
          ) : null}
        </View>
      }
    >
      <FieldLabel>Hora de despertar</FieldLabel>
      <TimeField label="Sonará a las" icon={AlarmClock} value={form.time} onChange={(v) => set('time', v)} />
      {next && form.enabled ? (
        <Txt variant="caption" className="mt-2">
          Sonará {describeUntil(next, new Date())}.
        </Txt>
      ) : null}

      <FieldLabel>Días</FieldLabel>
      <WeekdayPicker value={form.daysOfWeek} order={orderedWeekdays(weekStartsOn)} color={t.brand} onChange={(d: Weekday[]) => set('daysOfWeek', d)} />
      <View className="mt-3">
        <ChipGroup
          value={null}
          onChange={(v) => set('daysOfWeek', v === 'all' ? ALL_DAYS : v === 'week' ? [1, 2, 3, 4, 5] : [0, 6])}
          options={[
            { value: 'week', label: 'Lunes a viernes' },
            { value: 'weekend', label: 'Fines de semana' },
            { value: 'all', label: 'Todos los días' },
          ]}
        />
      </View>

      <FieldLabel>Nombre</FieldLabel>
      <TextField value={form.label} onChangeText={(v) => set('label', v)} placeholder="Ej. Gimnasio" maxLength={30} />

      <FieldLabel>Tipo de alarma</FieldLabel>
      {Platform.OS === 'android' ? (
        <>
          <Segmented<WakeAlarmMode>
            value={form.mode}
            onChange={(v) => {
              if (v === 'system' && !systemSupported) {
                showAlert(
                  'Requiere la app instalada',
                  'La alarma del Reloj del sistema necesita la versión instalable de Rutiva (no funciona en Expo Go). Mientras tanto usa «Aviso de Rutiva».',
                );
                return;
              }
              set('mode', v);
            }}
            options={[
              { value: 'system', label: 'Reloj del sistema' },
              { value: 'app', label: 'Aviso de Rutiva' },
            ]}
          />
          <Txt variant="caption" className="mt-2 leading-5">
            {form.mode === 'system'
              ? 'Alarma real en tu app Reloj: suena hasta que la apagas, a pantalla completa y aunque Rutiva esté cerrada. Para borrarla o cambiarla después, también hazlo en el Reloj.'
              : 'Notificación exacta con sonido de alarma (salta el No molestar) y botón de posponer. Suena una vez, unos 25 segundos.'}
          </Txt>
          {form.mode === 'system' && systemSupported ? (
            <Button className="mt-3" variant="secondary" icon={ExternalLink} title="Abrir alarmas del Reloj" onPress={() => systemAlarms.show()} />
          ) : null}
        </>
      ) : (
        <Card>
          <Txt variant="caption" className="leading-5">
            En {Platform.OS === 'ios' ? 'iPhone' : 'esta plataforma'} se usa un aviso con sonido y prioridad alta. iOS no permite a las apps crear
            alarmas del sistema salvo con AlarmKit (iOS 26+), que requeriría una versión específica de la app.
          </Txt>
        </Card>
      )}

      {form.mode === 'app' ? (
        <>
          <FieldLabel>Sonido</FieldLabel>
          <ChipGroup<WakeSound>
            value={form.sound}
            onChange={(v) => set('sound', v)}
            options={(Object.keys(WAKE_SOUNDS) as WakeSound[]).map((k) => ({ value: k, label: WAKE_SOUNDS[k].label }))}
          />
          <FieldLabel>Posponer</FieldLabel>
          <Card className="py-3">
            <View className="flex-row items-center justify-between">
              <Txt variant="label">{form.snoozeMinutes} minutos</Txt>
              <Stepper value={form.snoozeMinutes} min={1} max={30} onChange={(v) => set('snoozeMinutes', v)} />
            </View>
          </Card>
          {notificationsSupported ? (
            <Button
              className="mt-4"
              variant="secondary"
              icon={Play}
              title="Probar (suena en 5 segundos)"
              onPress={async () => {
                const ok = await testWakeAlarm({ ...form, id: 'test', notificationIds: [] }, userName.trim());
                if (ok) toast('Bloquea el teléfono: sonará en 5 segundos');
                else showAlert('Sin permiso', 'Activa las notificaciones de Rutiva en los ajustes del sistema.');
              }}
            />
          ) : null}
        </>
      ) : null}

      <FieldLabel>Estado</FieldLabel>
      <Card className="py-1">
        <ListRow
          icon={BellRing}
          title="Alarma activada"
          subtitle={form.enabled ? 'Sonará los días elegidos' : 'No sonará hasta que la actives'}
          last
          right={<Toggle value={form.enabled} onValueChange={(v) => set('enabled', v)} />}
        />
      </Card>
    </ModalScreen>
  );
}
