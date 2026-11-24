import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AlarmClock, BedDouble, Check, Hourglass, Info, Moon, Trash } from 'lucide-react-native';
import { formatDuration, formatEs, formatIsoTime, shiftKey, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import { computeSleepWindow, QUALITY_LABELS, SOURCE_LABELS, sleepDateOf, sleepDuration, sleepProblem } from '@/domain/sleep';
import type { DateKey, SleepSource } from '@/domain/types';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useSleepSessionStore } from '@/features/sleep/store/sleepSession';
import { toast } from '@/ui/toast';
import { useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { confirmAction, showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { ModalScreen } from '@/ui/layout';
import { Button, Card, PressableScale, Txt, cx } from '@/ui/primitives';
import { FieldLabel, Stepper, TextField, TimeField } from '@/ui/form';

/**
 * Registro de sueño.
 * - Sin parámetros: registro manual.
 * - ?id=…: corregir un registro existente.
 * - ?start=…&end=…: revisar una sesión del temporizador antes de guardarla.
 */
export default function SleepFormScreen() {
  const t = useTheme();
  const today = useToday();
  const params = useLocalSearchParams<{ id?: string; start?: string; end?: string }>();
  const logs = useSleepStore((s) => s.logs);
  const { save, remove, restore } = useSleepStore.getState();
  const session = useSleepSessionStore((s) => s.session);
  const goal = useSettingsStore((s) => s.settings.sleepGoalMinutes);
  const existing = params.id ? logs.find((l) => l.id === params.id) : undefined;
  const fromTimer = !existing && !!params.start && !!params.end;
  const last = logs[0];

  const source: SleepSource = existing?.source ?? (fromTimer ? 'timer' : 'manual');
  const initialBed = existing?.bedtimeAt ?? (fromTimer ? params.start! : null);
  const initialWake = existing?.wakeAt ?? (fromTimer ? params.end! : null);

  const [date, setDate] = useState<DateKey>(existing?.date ?? (initialWake ? sleepDateOf(initialWake) : today));
  const [bedtime, setBedtime] = useState(initialBed ? formatIsoTime(initialBed) : last ? formatIsoTime(last.bedtimeAt) : '23:00');
  const [wakeTime, setWakeTime] = useState(initialWake ? formatIsoTime(initialWake) : last ? formatIsoTime(last.wakeAt) : '07:00');
  const [latency, setLatency] = useState(existing?.latencyMinutes ?? 0);
  const [quality, setQuality] = useState(existing?.quality ?? 3);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Mientras no se toquen las horas del temporizador se conservan los instantes exactos.
  const untouched =
    !!initialBed &&
    !!initialWake &&
    bedtime === formatIsoTime(initialBed) &&
    wakeTime === formatIsoTime(initialWake) &&
    date === sleepDateOf(initialWake);
  const window = useMemo(
    () => (untouched ? { bedtimeAt: initialBed!, wakeAt: initialWake! } : computeSleepWindow(date, bedtime, wakeTime)),
    [untouched, initialBed, initialWake, date, bedtime, wakeTime],
  );
  const duration = sleepDuration(window.bedtimeAt, window.wakeAt, latency);
  const problem = sleepProblem(window.bedtimeAt, window.wakeAt, latency);
  const dates = Array.from({ length: 14 }, (_, i) => shiftKey(today, -i));
  const replacing = !existing && logs.some((l) => l.date === date);

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    try {
      await save(
        { date, bedtimeAt: window.bedtimeAt, wakeAt: window.wakeAt, latencyMinutes: latency, quality, notes: notes.trim() || null, source },
        existing?.id,
        fromTimer ? (session?.id ?? null) : null,
      );
      if (fromTimer) await useSleepSessionStore.getState().complete(window.wakeAt);
      haptics.success();
      toast(existing ? 'Cambios guardados' : `Sueño registrado: ${formatDuration(duration)}`);
      goBack('/sleep');
    } catch (e) {
      showError('No se pudo guardar', e);
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    confirmAction('Eliminar registro', '¿Eliminar este registro de sueño?', 'Eliminar', async () => {
      haptics.warning();
      try {
        await remove(existing.id);
        goBack('/sleep');
        toast('Registro eliminado', { undo: () => restore(existing.id) });
      } catch (e) {
        showError('No se pudo eliminar', e);
      }
    });
  };

  return (
    <ModalScreen
      title={existing ? 'Corregir sueño' : fromTimer ? 'Buenos días' : 'Registrar sueño'}
      footer={
        <View className="gap-2">
          {problem ? (
            <Txt variant="caption" className="text-center text-danger dark:text-danger">
              {problem}
            </Txt>
          ) : null}
          <Button title={existing ? 'Guardar cambios' : 'Guardar'} icon={Check} disabled={saving || !!problem} onPress={submit} />
          {existing ? <Button title="Eliminar registro" icon={Trash} variant="ghost" onPress={onDelete} /> : null}
        </View>
      }
    >
      {/* Resumen en vivo */}
      <Card className="items-center py-6">
        <Moon size={26} color={t.sleep} />
        <Text className="mt-2 text-[34px] font-bold text-ink dark:text-ink-dark">{formatDuration(duration)}</Text>
        <Txt variant="caption" className="mt-1">
          {duration >= goal ? 'Cumples tu meta de sueño' : `Te faltan ${formatDuration(goal - duration)} para tu meta`}
        </Txt>
        <View className="mt-3 rounded-full bg-subtle px-3 py-1 dark:bg-subtle-dark">
          <Txt variant="caption">{SOURCE_LABELS[source].label}</Txt>
        </View>
      </Card>

      {source === 'timer' ? (
        <View className="mt-3 flex-row gap-2 rounded-2xl bg-sleep/10 px-3 py-3">
          <Info size={16} color={t.sleep} />
          <Txt variant="caption" className="flex-1 leading-5">
            Registro estimado: el temporizador mide desde «Voy a dormir» hasta «Me desperté». No detecta si dormías. Ajusta las
            horas o indica cuánto tardaste en dormirte.
          </Txt>
        </View>
      ) : null}

      <FieldLabel>Noche que termina el</FieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerClassName="gap-2 px-5">
        {dates.map((d) => {
          const isSel = d === date;
          return (
            <PressableScale
              key={d}
              scaleTo={0.92}
              onPress={() => {
                haptics.selection();
                setDate(d);
              }}
              className={cx(
                'h-16 w-14 items-center justify-center rounded-2xl border',
                isSel ? 'border-sleep bg-sleep' : 'border-line bg-card dark:border-line-dark dark:bg-card-dark',
              )}
            >
              <Text className={cx('text-[11px] font-semibold', isSel ? 'text-white/80' : 'text-muted dark:text-muted-dark')}>
                {d === today ? 'Hoy' : WEEKDAY_SHORT[weekdayOf(d)]}
              </Text>
              <Text className={cx('mt-0.5 text-[18px] font-bold', isSel ? 'text-white' : 'text-ink dark:text-ink-dark')}>{formatEs(d, 'd')}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      {replacing ? (
        <Txt variant="caption" className="mt-2 text-warning dark:text-warning">
          Ya hay un registro para este día; se reemplazará.
        </Txt>
      ) : null}

      <FieldLabel>Horario</FieldLabel>
      <View className="gap-3">
        <TimeField label="Me acosté" icon={BedDouble} value={bedtime} onChange={setBedtime} />
        <TimeField label="Me desperté" icon={AlarmClock} value={wakeTime} onChange={setWakeTime} />
      </View>
      <Txt variant="caption" className="mt-2">
        Si la hora de acostarte es posterior a la de despertar, se cuenta desde la noche anterior.
      </Txt>

      <FieldLabel hint="Se descuenta del total">Tardé en dormirme</FieldLabel>
      <Card className="py-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Hourglass size={18} color={t.sleep} />
            <Txt variant="label">{latency === 0 ? 'Enseguida' : formatDuration(latency)}</Txt>
          </View>
          <Stepper value={latency} min={0} max={180} step={5} onChange={setLatency} format={(v) => `${v} min`} />
        </View>
      </Card>

      <FieldLabel hint={QUALITY_LABELS[quality]}>Calidad del sueño</FieldLabel>
      <View className="flex-row gap-2">
        {[1, 2, 3, 4, 5].map((q) => {
          const isSel = q === quality;
          return (
            <PressableScale
              key={q}
              scaleTo={0.9}
              accessibilityLabel={QUALITY_LABELS[q]}
              onPress={() => {
                haptics.selection();
                setQuality(q);
              }}
              className={cx(
                'h-12 flex-1 items-center justify-center rounded-2xl border',
                isSel ? 'border-warning bg-warning/15' : 'border-line bg-card dark:border-line-dark dark:bg-card-dark',
              )}
            >
              <Text className={cx('text-[16px] font-bold', isSel ? 'text-warning' : 'text-muted dark:text-muted-dark')}>{q}</Text>
            </PressableScale>
          );
        })}
      </View>

      <FieldLabel hint="Opcional">Notas</FieldLabel>
      <TextField
        value={notes}
        onChangeText={setNotes}
        placeholder="Café tarde, pantallas, desperté varias veces…"
        multiline
        maxLength={200}
        className="min-h-[88px]"
        textAlignVertical="top"
      />
    </ModalScreen>
  );
}
