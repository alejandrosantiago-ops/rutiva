import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Bell, ChevronLeft, ChevronRight, Droplets, GlassWater, Plus, Target, X } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { formatEs, shiftKey, timeToMinutes, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import { formatWater, unitToMl, WATER_QUICK_ML, waterReminderSlots, waterSeries } from '@/domain/water';
import type { WaterUnit } from '@/domain/types';
import { useWaterStore } from '@/stores/useWaterStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { syncWaterReminders } from '@/stores/waterReminders';
import { useWaterTotals } from '@/hooks/useLogIndex';
import { useToday } from '@/hooks/useToday';
import { useTheme, WATER_COLOR } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { showAlert, showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { notificationsSupported } from '@/services/notifications';
import { Button, Card, IconButton, PressableScale, SectionHeader, Txt, cx } from '@/components/ui/primitives';
import { AnimatedBar, ProgressBar, ProgressRing } from '@/components/ui/progress';
import { ChipGroup, FieldLabel, ListRow, NumberField, Segmented, Stepper, TimeField, Toggle } from '@/components/ui/form';

const INTERVALS = [30, 60, 90, 120, 180];

export default function WaterScreen() {
  const t = useTheme();
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(params.date && params.date <= today ? params.date : today);
  const logs = useWaterStore((s) => s.logs);
  const { add, remove } = useWaterStore.getState();
  const totals = useWaterTotals();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [custom, setCustom] = useState<number | null>(null);
  const [customKey, setCustomKey] = useState(0);

  const goal = settings.waterGoalMl;
  const unit = settings.waterUnit;
  const total = totals[date] ?? 0;
  const remaining = Math.max(0, goal - total);
  const entries = useMemo(() => logs.filter((l) => l.date === date).reverse(), [logs, date]);
  const history = useMemo(() => waterSeries(totals, today, 14), [totals, today]);
  const maxHistory = Math.max(goal, ...history.map((h) => h.ml));

  const addMl = (ml: number) => {
    if (total < goal && total + ml >= goal) haptics.success();
    else haptics.light();
    add(date, ml).catch((e) => showError('No se pudo guardar', e));
  };

  const updateReminder = async <K extends 'waterReminderEnabled' | 'waterReminderStart' | 'waterReminderEnd' | 'waterReminderEveryMinutes'>(
    key: K,
    value: (typeof settings)[K],
  ) => {
    await update(key, value);
    const ok = await syncWaterReminders();
    if (!ok) showAlert('Permiso necesario', 'Activa las notificaciones de Rutiva en los ajustes del sistema.');
  };

  const slots = waterReminderSlots(
    timeToMinutes(settings.waterReminderStart),
    timeToMinutes(settings.waterReminderEnd),
    settings.waterReminderEveryMinutes,
  ).length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <View className="flex-row items-center gap-3 px-5 py-2">
        <IconButton icon={ChevronLeft} label="Volver" onPress={() => goBack()} size={40} />
        <Txt variant="title">Hidratación</Txt>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-16" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Selector de día */}
        <View className="mt-2 flex-row items-center justify-between">
          <IconButton icon={ChevronLeft} tone="plain" label="Día anterior" size={36} onPress={() => setDate(shiftKey(date, -1))} />
          <Txt variant="heading">{date === today ? 'Hoy' : formatEs(date, "EEEE d 'de' MMMM")}</Txt>
          <View style={{ opacity: date >= today ? 0.25 : 1 }}>
            <IconButton icon={ChevronRight} tone="plain" label="Día siguiente" size={36} onPress={() => date < today && setDate(shiftKey(date, 1))} />
          </View>
        </View>

        {/* Progreso */}
        <View className="mt-3 items-center">
          <ProgressRing progress={total / goal} size={190} stroke={16} color={WATER_COLOR} trackColor={`${WATER_COLOR}22`}>
            <Droplets size={24} color={WATER_COLOR} />
            <Text className="mt-1 text-[32px] font-bold text-ink dark:text-ink-dark">{formatWater(total, unit)}</Text>
            <Txt variant="caption">de {formatWater(goal, unit)}</Txt>
          </ProgressRing>
          <Txt variant="label" className="mt-3">
            {remaining > 0 ? `Te faltan ${formatWater(remaining, unit)}` : '¡Meta de hidratación cumplida!'}
          </Txt>
        </View>
        <ProgressBar className="mt-4" progress={total / goal} color={WATER_COLOR} height={10} />

        {/* Registro rápido */}
        <FieldLabel>Registrar</FieldLabel>
        <View className="flex-row gap-3">
          {WATER_QUICK_ML.map((ml, i) => (
            <PressableScale
              key={ml}
              haptic
              scaleTo={0.92}
              onPress={() => addMl(ml)}
              accessibilityLabel={`Añadir ${ml} mililitros`}
              className="flex-1 items-center rounded-3xl border border-line bg-card py-4 dark:border-line-dark dark:bg-card-dark"
            >
              <GlassWater size={20 + i * 6} color={WATER_COLOR} strokeWidth={2} />
              <Text className="mt-2 text-[15px] font-bold text-ink dark:text-ink-dark">+{ml} ml</Text>
            </PressableScale>
          ))}
        </View>
        <View className="mt-3 flex-row items-center gap-2">
          <View className="flex-1">
            <NumberField key={customKey} value={null} onChange={setCustom} placeholder={`Otra cantidad (${unit})`} suffix={unit} />
          </View>
          <Button
            title="Añadir"
            icon={Plus}
            disabled={!custom}
            onPress={() => {
              if (!custom) return;
              addMl(unitToMl(custom, unit));
              setCustom(null);
              setCustomKey((k) => k + 1);
            }}
          />
        </View>

        {/* Registros del día */}
        <SectionHeader title={`Registros · ${entries.length}`} />
        {entries.length === 0 ? (
          <Txt variant="caption">Aún no hay registros este día.</Txt>
        ) : (
          <Card className="py-1">
            {entries.map((e, i) => (
              <Animated.View key={e.id} entering={FadeInDown.duration(220)} layout={LinearTransition}>
                <View className={cx('flex-row items-center gap-3 py-3', i < entries.length - 1 && 'border-b border-line dark:border-line-dark')}>
                  <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${WATER_COLOR}1F` }}>
                    <GlassWater size={16} color={WATER_COLOR} />
                  </View>
                  <Txt variant="label" className="flex-1">
                    {formatWater(e.amountMl, 'ml')}
                  </Txt>
                  <Txt variant="caption">{format(parseISO(e.createdAt), 'HH:mm')}</Txt>
                  <PressableScale accessibilityLabel="Eliminar registro" hitSlop={8} onPress={() => remove(e.id).catch((er) => showError('No se pudo eliminar', er))}>
                    <X size={18} color={t.muted} />
                  </PressableScale>
                </View>
              </Animated.View>
            ))}
          </Card>
        )}

        {/* Historial */}
        <SectionHeader title="Últimos 14 días" />
        <Card className="pt-5">
          <View style={{ height: 110 }} className="flex-row items-end justify-between">
            <View
              pointerEvents="none"
              className="absolute left-0 right-0"
              style={{ bottom: (goal / maxHistory) * 110, borderTopWidth: 1, borderStyle: 'dashed', borderColor: t.muted, opacity: 0.6 }}
            />
            {history.map((h, i) => (
              <PressableScale key={h.date} onPress={() => setDate(h.date)} className="flex-1 items-center justify-end" style={{ height: 110 }}>
                <AnimatedBar ratio={h.ml / maxHistory} maxHeight={110} width={10} delay={i * 25} color={h.ml >= goal ? WATER_COLOR : `${WATER_COLOR}77`} />
              </PressableScale>
            ))}
          </View>
          <View className="mt-2 flex-row justify-between">
            {history.map((h) => (
              <Text key={h.date} className={cx('flex-1 text-center text-[10px] font-semibold', h.date === date ? 'text-cyan-500' : 'text-muted dark:text-muted-dark')}>
                {WEEKDAY_SHORT[weekdayOf(h.date)]}
              </Text>
            ))}
          </View>
          <Txt variant="caption" className="mt-3">
            Meta cumplida {history.filter((h) => h.ml >= goal).length} de 14 días · media{' '}
            {formatWater(history.reduce((a, h) => a + h.ml, 0) / 14, unit)}
          </Txt>
        </Card>

        {/* Ajustes */}
        <SectionHeader title="Meta y unidades" />
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Target size={18} color={WATER_COLOR} />
              <Txt variant="label">Meta diaria</Txt>
            </View>
            <Stepper value={goal} min={500} max={6000} step={250} format={(v) => formatWater(v, unit)} onChange={(v) => update('waterGoalMl', v)} />
          </View>
          <View className="mt-4">
            <Segmented<WaterUnit>
              value={unit}
              onChange={(v) => update('waterUnit', v)}
              options={[
                { value: 'L', label: 'Litros' },
                { value: 'ml', label: 'Mililitros' },
              ]}
            />
          </View>
        </Card>

        <SectionHeader title="Recordatorios" />
        <Card className="py-1">
          <ListRow
            icon={Bell}
            iconColor={WATER_COLOR}
            title="Recordarme beber agua"
            subtitle={
              !notificationsSupported
                ? 'Disponible en Android e iOS'
                : settings.waterReminderEnabled
                  ? `${slots} avisos al día`
                  : 'Desactivado'
            }
            last
            right={<Toggle value={settings.waterReminderEnabled} onValueChange={(v) => updateReminder('waterReminderEnabled', v)} />}
          />
        </Card>
        {settings.waterReminderEnabled ? (
          <View className="mt-3 gap-3">
            <TimeField label="Desde" value={settings.waterReminderStart} onChange={(v) => updateReminder('waterReminderStart', v)} />
            <TimeField label="Hasta" value={settings.waterReminderEnd} onChange={(v) => updateReminder('waterReminderEnd', v)} />
            <Txt variant="overline" className="mt-1">
              Cada
            </Txt>
            <ChipGroup
              value={String(settings.waterReminderEveryMinutes)}
              onChange={(v) => updateReminder('waterReminderEveryMinutes', Number(v))}
              options={INTERVALS.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', ' h 30') }))}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
