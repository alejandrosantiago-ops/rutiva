import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { confirmAction, showError } from '@/lib/dialogs';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { AlarmClock, BedDouble, Check, Moon, Trash } from 'lucide-react-native';
import { formatDuration, formatEs, formatIsoTime, shiftKey, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import { computeSleepWindow, QUALITY_LABELS } from '@/domain/sleep';
import type { DateKey } from '@/domain/types';
import { useSleepStore } from '@/stores/useSleepStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { ModalScreen } from '@/components/ui/layout';
import { Button, Card, PressableScale, Txt, cx } from '@/components/ui/primitives';
import { FieldLabel, TextField, TimeField } from '@/components/ui/form';

export default function SleepFormScreen() {
  const t = useTheme();
  const today = useToday();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const logs = useSleepStore((s) => s.logs);
  const { save, remove } = useSleepStore.getState();
  const goal = useSettingsStore((s) => s.settings.sleepGoalMinutes);
  const existing = id ? logs.find((l) => l.id === id) : undefined;
  const last = logs[0];

  const [date, setDate] = useState<DateKey>(existing?.date ?? today);
  const [bedtime, setBedtime] = useState(existing ? formatIsoTime(existing.bedtimeAt) : last ? formatIsoTime(last.bedtimeAt) : '23:00');
  const [wakeTime, setWakeTime] = useState(existing ? formatIsoTime(existing.wakeAt) : last ? formatIsoTime(last.wakeAt) : '07:00');
  const [quality, setQuality] = useState(existing?.quality ?? 3);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const duration = useMemo(() => computeSleepWindow(date, bedtime, wakeTime).durationMinutes, [date, bedtime, wakeTime]);
  const dates = Array.from({ length: 14 }, (_, i) => shiftKey(today, -i));
  const replacing = !existing && logs.some((l) => l.date === date);

  const submit = async () => {
    setSaving(true);
    try {
      await save({ date, bedtime, wakeTime, quality, notes: notes.trim() || null }, existing?.id);
      haptics.success();
      goBack();
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
        goBack();
      } catch (e) {
        showError('No se pudo eliminar', e);
      }
    });
  };

  return (
    <ModalScreen
      title={existing ? 'Editar sueño' : 'Registrar sueño'}
      footer={
        <View className="gap-2">
          <Button title={existing ? 'Guardar cambios' : 'Guardar'} icon={Check} disabled={saving || duration <= 0} onPress={submit} />
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
      </Card>

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
              <Text className={cx('mt-0.5 text-[18px] font-bold', isSel ? 'text-white' : 'text-ink dark:text-ink-dark')}>
                {formatEs(d, 'd')}
              </Text>
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
