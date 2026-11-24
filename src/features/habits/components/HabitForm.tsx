import { toast } from '@/ui/toast';
import { useState } from 'react';
import { View } from 'react-native';
import { Check, Droplets } from 'lucide-react-native';
import type { HabitCategory, HabitFrequency, HabitInput, TrackingType, Weekday } from '@/domain/types';
import { ALL_DAYS, describeFrequency, describeTarget, formatMinutes, TRACKING_LABELS } from '@/domain/habits';
import { CATEGORIES, CATEGORY_KEYS, QUANTITY_UNITS } from '@/domain/categories';
import { isWaterHabit } from '@/domain/water';
import { orderedWeekdays, todayKey } from '@/domain/dates';
import { HABIT_COLORS } from '@/theme/colors';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { haptics } from '@/lib/haptics';
import { showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { notificationsSupported } from '@/services/notifications';
import { ModalScreen } from '@/ui/layout';
import { Button, Card, IconBadge, Txt } from '@/ui/primitives';
import {
  ChipGroup,
  ColorPicker,
  DateField,
  FieldLabel,
  IconPicker,
  ListRow,
  NumberField,
  ReminderTimesField,
  Segmented,
  Stepper,
  TextField,
  TimeField,
  Toggle,
  WeekdayPicker,
} from '@/ui/form';
import { habitIcon } from '@/features/habits/components/habitIcons';

export function emptyHabit(): HabitInput {
  return {
    name: '',
    description: null,
    category: 'custom',
    icon: CATEGORIES.custom.icon,
    color: CATEGORIES.custom.color,
    trackingType: 'check',
    target: 1,
    unit: null,
    frequency: 'daily',
    daysOfWeek: ALL_DAYS,
    intervalDays: 2,
    startDate: todayKey(),
    endDate: null,
    suggestedTime: null,
    reminderTimes: [],
  };
}

const SUGGESTIONS: (Partial<HabitInput> & { name: string; category: HabitCategory })[] = [
  { name: 'Beber agua', category: 'hydration', trackingType: 'quantity', target: 2.5, unit: 'L' },
  { name: 'Entrenamiento', category: 'exercise', trackingType: 'duration', target: 60 },
  { name: 'Leer', category: 'study', icon: 'book', trackingType: 'check', description: '10 páginas' },
  { name: 'Estudiar programación', category: 'study', icon: 'code', trackingType: 'duration', target: 60 },
  { name: 'Tomar vitaminas', category: 'health', icon: 'pill', trackingType: 'check' },
  { name: 'Caminar', category: 'exercise', icon: 'walk', trackingType: 'count', target: 2 },
  { name: 'Meditar', category: 'wellbeing', trackingType: 'duration', target: 10 },
];

const DEFAULT_TARGET: Record<TrackingType, number> = { check: 1, quantity: 1, duration: 30, count: 2 };
const DURATION_PRESETS = [10, 15, 30, 45, 60, 90, 120];

export function HabitForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  isNew,
}: {
  title: string;
  initial: HabitInput;
  submitLabel: string;
  onSubmit: (input: HabitInput) => Promise<void>;
  isNew: boolean;
}) {
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);
  const [form, setForm] = useState<HabitInput>(initial);
  // Las sugerencias y el cambio de tipo reinician el campo numérico.
  const [targetKey, setTargetKey] = useState(0);
  const [customUnit, setCustomUnit] = useState(!!initial.unit && !QUANTITY_UNITS.includes(initial.unit));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof HabitInput>(key: K, value: HabitInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const Icon = habitIcon(form.icon);

  const problem = !form.name.trim()
    ? 'Escribe un nombre'
    : form.trackingType === 'quantity' && !form.unit?.trim()
      ? 'Indica la unidad'
      : !(form.target > 0)
        ? 'La meta debe ser mayor que 0'
        : form.endDate && form.endDate < form.startDate
          ? 'La fecha de fin es anterior al inicio'
          : null;

  const submit = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || null,
        target: form.trackingType === 'check' ? 1 : form.target,
        unit: form.trackingType === 'quantity' ? form.unit!.trim() : null,
        daysOfWeek: form.frequency === 'weekly' ? form.daysOfWeek : ALL_DAYS,
        intervalDays: form.frequency === 'interval' ? form.intervalDays : 1,
        reminderTimes: [...new Set(form.reminderTimes)].sort(),
      });
      haptics.success();
      goBack();
      toast(isNew ? 'Hábito creado' : 'Cambios guardados');
    } catch (e) {
      showError('No se pudo guardar', e);
      setSaving(false);
    }
  };

  const setCategory = (category: HabitCategory) =>
    setForm((f) => ({ ...f, category, icon: CATEGORIES[category].icon, color: CATEGORIES[category].color }));

  const setTracking = (trackingType: TrackingType) => {
    setTargetKey((k) => k + 1);
    setCustomUnit(false);
    setForm((f) => ({
      ...f,
      trackingType,
      target:
        trackingType === f.trackingType
          ? f.target
          : trackingType === 'quantity' && f.category === 'hydration'
            ? 2.5
            : DEFAULT_TARGET[trackingType],
      unit: trackingType === 'quantity' ? (f.unit ?? (f.category === 'hydration' ? 'L' : null)) : null,
    }));
  };

  const setFrequency = (frequency: HabitFrequency) =>
    setForm((f) => ({
      ...f,
      frequency,
      daysOfWeek: frequency === 'weekly' && f.daysOfWeek.length === 7 ? [1, 2, 3, 4, 5] : f.daysOfWeek,
      intervalDays: Math.max(2, f.intervalDays),
    }));

  return (
    <ModalScreen
      title={title}
      footer={
        <View>
          {problem && form.name ? (
            <Txt variant="caption" className="mb-2 text-center text-danger dark:text-danger">
              {problem}
            </Txt>
          ) : null}
          <Button title={submitLabel} icon={Check} disabled={!!problem || saving} onPress={submit} />
        </View>
      }
    >
      {/* Vista previa */}
      <Card className="flex-row items-center gap-3.5">
        <IconBadge icon={Icon} color={form.color} size={52} />
        <View className="flex-1">
          <Txt variant="heading" numberOfLines={1}>
            {form.name.trim() || 'Nuevo hábito'}
          </Txt>
          <Txt variant="caption" className="mt-0.5" numberOfLines={2}>
            {CATEGORIES[form.category].label} · {describeFrequency(form)} · {describeTarget(form)}
          </Txt>
        </View>
      </Card>

      {isNew ? (
        <>
          <FieldLabel>Ideas rápidas</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s.name}
                size="sm"
                variant="secondary"
                title={s.name}
                icon={habitIcon(s.icon ?? CATEGORIES[s.category].icon)}
                onPress={() => {
                  setTargetKey((k) => k + 1);
                  setCustomUnit(false);
                  setForm((f) => ({
                    ...f,
                    description: null,
                    unit: null,
                    target: 1,
                    icon: CATEGORIES[s.category].icon,
                    color: CATEGORIES[s.category].color,
                    ...s,
                  }));
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* ---------- Información básica ---------- */}
      <Txt variant="title" className="mt-8 text-[20px]">
        Información básica
      </Txt>

      <FieldLabel>Nombre</FieldLabel>
      <TextField value={form.name} onChangeText={(v) => set('name', v)} placeholder="Ej. Beber 2.5 litros de agua" maxLength={40} autoFocus={isNew} />

      <FieldLabel hint="Opcional">Descripción</FieldLabel>
      <TextField value={form.description ?? ''} onChangeText={(v) => set('description', v)} placeholder="¿Por qué es importante para ti?" maxLength={80} />

      <FieldLabel>Categoría</FieldLabel>
      <ChipGroup
        value={form.category}
        onChange={setCategory}
        options={CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORIES[k].label, icon: habitIcon(CATEGORIES[k].icon), color: CATEGORIES[k].color }))}
      />

      <FieldLabel>Icono</FieldLabel>
      <IconPicker value={form.icon} color={form.color} onChange={(v) => set('icon', v)} />

      <FieldLabel>Color</FieldLabel>
      <ColorPicker colors={HABIT_COLORS} value={form.color} onChange={(v) => set('color', v)} />

      {/* ---------- Seguimiento ---------- */}
      <Txt variant="title" className="mt-8 text-[20px]">
        Seguimiento
      </Txt>
      <FieldLabel>Tipo</FieldLabel>
      <Segmented<TrackingType>
        value={form.trackingType}
        onChange={setTracking}
        options={(['check', 'quantity', 'duration', 'count'] as TrackingType[]).map((k) => ({ value: k, label: TRACKING_LABELS[k].label }))}
      />
      <Txt variant="caption" className="mt-2">
        {TRACKING_LABELS[form.trackingType].hint}
      </Txt>

      {form.trackingType === 'quantity' ? (
        <>
          <FieldLabel>Meta diaria</FieldLabel>
          <NumberField key={targetKey} value={form.target} onChange={(v) => set('target', v ?? 0)} placeholder="Ej. 2.5" suffix={form.unit ?? ''} />
          <FieldLabel>Unidad</FieldLabel>
          <ChipGroup
            value={customUnit ? '__other' : form.unit}
            onChange={(u) => {
              if (u === '__other') {
                setCustomUnit(true);
                set('unit', '');
              } else {
                setCustomUnit(false);
                set('unit', u);
              }
            }}
            options={[...QUANTITY_UNITS.map((u) => ({ value: u, label: u })), { value: '__other', label: 'Otra…' }]}
          />
          {customUnit ? (
            <TextField className="mt-3" value={form.unit ?? ''} onChangeText={(v) => set('unit', v)} placeholder="Unidad (ej. series)" maxLength={16} />
          ) : null}
          {isWaterHabit(form) ? (
            <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-cyan-500/10 px-3 py-2.5">
              <Droplets size={16} color="#06B6D4" />
              <Txt variant="caption" className="flex-1">
                Se sincroniza con el módulo de hidratación: lo que registres allí cuenta aquí.
              </Txt>
            </View>
          ) : null}
        </>
      ) : null}

      {form.trackingType === 'duration' ? (
        <>
          <FieldLabel hint="Minutos u horas">Meta diaria</FieldLabel>
          <Card className="py-3">
            <View className="flex-row items-center justify-between">
              <Txt variant="label">{formatMinutes(form.target)}</Txt>
              <Stepper value={form.target} min={5} max={600} step={5} onChange={(v) => set('target', v)} format={(v) => `${v} min`} />
            </View>
          </Card>
          <View className="mt-3">
            <ChipGroup
              value={String(form.target)}
              onChange={(v) => set('target', Number(v))}
              options={DURATION_PRESETS.map((m) => ({ value: String(m), label: formatMinutes(m) }))}
            />
          </View>
        </>
      ) : null}

      {form.trackingType === 'count' ? (
        <>
          <FieldLabel>Veces al día</FieldLabel>
          <Card className="py-3">
            <View className="flex-row items-center justify-between">
              <Txt variant="label">{form.target === 1 ? '1 vez' : `${form.target} veces`}</Txt>
              <Stepper value={form.target} min={1} max={50} onChange={(v) => set('target', v)} />
            </View>
          </Card>
        </>
      ) : null}

      {/* ---------- Programación ---------- */}
      <Txt variant="title" className="mt-8 text-[20px]">
        Programación
      </Txt>
      <FieldLabel>Frecuencia</FieldLabel>
      <Segmented<HabitFrequency>
        value={form.frequency}
        onChange={setFrequency}
        options={[
          { value: 'daily', label: 'Diario' },
          { value: 'weekly', label: 'Días' },
          { value: 'interval', label: 'Intervalo' },
        ]}
      />
      {form.frequency === 'weekly' ? (
        <View className="mt-4">
          <WeekdayPicker value={form.daysOfWeek} order={orderedWeekdays(weekStartsOn)} color={form.color} onChange={(d: Weekday[]) => set('daysOfWeek', d)} />
        </View>
      ) : null}
      {form.frequency === 'interval' ? (
        <Card className="mt-4 py-3">
          <View className="flex-row items-center justify-between">
            <Txt variant="label">Cada {form.intervalDays} días</Txt>
            <Stepper value={form.intervalDays} min={2} max={30} onChange={(v) => set('intervalDays', v)} />
          </View>
          <Txt variant="caption" className="mt-2">
            Se cuenta desde la fecha de inicio.
          </Txt>
        </Card>
      ) : null}

      <FieldLabel>Fechas</FieldLabel>
      <View className="gap-3">
        <DateField label="Inicio" value={form.startDate} onChange={(v) => set('startDate', v)} />
        <Card className="py-1">
          <ListRow
            title="Fecha de finalización"
            subtitle={form.endDate ? 'El hábito dejará de aparecer después' : 'Opcional: sin fecha, se repite siempre'}
            last
            right={<Toggle value={!!form.endDate} onValueChange={(v) => set('endDate', v ? form.startDate : null)} />}
          />
        </Card>
        {form.endDate ? <DateField label="Fin" value={form.endDate} minimumDate={form.startDate} onChange={(v) => set('endDate', v)} /> : null}
      </View>

      <FieldLabel hint="Opcional">Hora sugerida</FieldLabel>
      <Card className="py-1">
        <ListRow
          title="Indicar una hora"
          subtitle="Ordena el «próximo hábito» en Inicio"
          last
          right={<Toggle value={!!form.suggestedTime} onValueChange={(v) => set('suggestedTime', v ? '08:00' : null)} />}
        />
      </Card>
      {form.suggestedTime ? (
        <View className="mt-3">
          <TimeField label="Hora sugerida" value={form.suggestedTime} onChange={(v) => set('suggestedTime', v)} />
        </View>
      ) : null}

      {/* ---------- Recordatorios ---------- */}
      <FieldLabel hint={notificationsSupported ? `${form.reminderTimes.length}/5` : 'Solo Android e iOS'}>Recordatorios</FieldLabel>
      <ReminderTimesField value={form.reminderTimes} onChange={(v) => set('reminderTimes', v)} />
      {!notificationsSupported ? (
        <Txt variant="caption" className="mt-2">
          Se guardan igualmente y sonarán al usar la app en el móvil.
        </Txt>
      ) : null}
    </ModalScreen>
  );
}
