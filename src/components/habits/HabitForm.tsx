import { useState } from 'react';
import { View } from 'react-native';
import { showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { Bell, Check } from 'lucide-react-native';
import type { HabitInput, Weekday } from '@/domain/types';
import { ALL_DAYS, describeFrequency } from '@/domain/habits';
import { orderedWeekdays } from '@/domain/dates';
import { HABIT_COLORS } from '@/theme/colors';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { haptics } from '@/lib/haptics';
import { notificationsSupported } from '@/services/notifications';
import { ModalScreen } from '@/components/ui/layout';
import { Button, Card, IconBadge, Txt } from '@/components/ui/primitives';
import {
  ColorPicker,
  FieldLabel,
  IconPicker,
  ListRow,
  Segmented,
  Stepper,
  TextField,
  TimeField,
  Toggle,
  WeekdayPicker,
} from '@/components/ui/form';
import { habitIcon } from './habitIcons';

export const EMPTY_HABIT: HabitInput = {
  name: '',
  description: null,
  icon: 'target',
  color: HABIT_COLORS[0],
  frequency: 'daily',
  daysOfWeek: ALL_DAYS,
  targetPerDay: 1,
  unit: null,
  reminderEnabled: false,
  reminderTime: '09:00',
};

const SUGGESTIONS: Partial<HabitInput>[] = [
  { name: 'Beber agua', icon: 'water', color: '#06B6D4', targetPerDay: 8, unit: 'vasos' },
  { name: 'Leer', icon: 'book', color: '#F59E0B', description: '10 páginas' },
  { name: 'Meditar', icon: 'meditate', color: '#A855F7', description: '5 minutos' },
  { name: 'Hacer ejercicio', icon: 'workout', color: '#EF4444' },
  { name: 'Caminar', icon: 'walk', color: '#10B981', description: '30 minutos' },
];

export function HabitForm({
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  title: string;
  initial: HabitInput;
  submitLabel: string;
  onSubmit: (input: HabitInput) => Promise<void>;
}) {
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);
  const [form, setForm] = useState<HabitInput>(initial);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.name;
  const set = <K extends keyof HabitInput>(key: K, value: HabitInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const Icon = habitIcon(form.icon);
  const valid = form.name.trim().length > 0;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        description: form.description?.trim() || null,
        unit: form.targetPerDay > 1 ? form.unit?.trim() || null : null,
        daysOfWeek: form.frequency === 'daily' ? ALL_DAYS : form.daysOfWeek,
      });
      haptics.success();
      goBack();
    } catch (e) {
      showError('No se pudo guardar', e);
      setSaving(false);
    }
  };

  return (
    <ModalScreen
      title={title}
      footer={<Button title={submitLabel} icon={Check} disabled={!valid || saving} onPress={submit} />}
    >
      {/* Vista previa */}
      <Card className="flex-row items-center gap-3.5">
        <IconBadge icon={Icon} color={form.color} size={52} />
        <View className="flex-1">
          <Txt variant="heading" numberOfLines={1}>
            {form.name.trim() || 'Nuevo hábito'}
          </Txt>
          <Txt variant="caption" className="mt-0.5">
            {describeFrequency(form)}
            {form.targetPerDay > 1 ? ` · ${form.targetPerDay}${form.unit ? ` ${form.unit}` : ' veces'}` : ''}
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
                title={s.name!}
                icon={habitIcon(s.icon!)}
                onPress={() => setForm((f) => ({ ...f, description: null, targetPerDay: 1, unit: null, ...s }))}
              />
            ))}
          </View>
        </>
      ) : null}

      <FieldLabel>Nombre</FieldLabel>
      <TextField
        value={form.name}
        onChangeText={(v) => set('name', v)}
        placeholder="Ej. Leer 10 páginas"
        maxLength={40}
        autoFocus={isNew}
        returnKeyType="done"
      />

      <FieldLabel hint="Opcional">Descripción</FieldLabel>
      <TextField
        value={form.description ?? ''}
        onChangeText={(v) => set('description', v)}
        placeholder="¿Por qué es importante para ti?"
        maxLength={80}
      />

      <FieldLabel>Icono</FieldLabel>
      <IconPicker value={form.icon} color={form.color} onChange={(v) => set('icon', v)} />

      <FieldLabel>Color</FieldLabel>
      <ColorPicker colors={HABIT_COLORS} value={form.color} onChange={(v) => set('color', v)} />

      <FieldLabel>Frecuencia</FieldLabel>
      <Segmented
        value={form.frequency}
        onChange={(v) => setForm((f) => ({ ...f, frequency: v, daysOfWeek: v === 'daily' ? ALL_DAYS : f.daysOfWeek }))}
        options={[
          { value: 'daily', label: 'Todos los días' },
          { value: 'custom', label: 'Días concretos' },
        ]}
      />
      {form.frequency === 'custom' ? (
        <View className="mt-4">
          <WeekdayPicker
            value={form.daysOfWeek}
            order={orderedWeekdays(weekStartsOn)}
            color={form.color}
            onChange={(d: Weekday[]) => set('daysOfWeek', d)}
          />
        </View>
      ) : null}

      <FieldLabel hint="Veces al día para completarlo">Meta diaria</FieldLabel>
      <Card className="py-3">
        <View className="flex-row items-center justify-between">
          <Txt variant="label">{form.targetPerDay === 1 ? 'Una vez' : `${form.targetPerDay} veces`}</Txt>
          <Stepper value={form.targetPerDay} min={1} max={50} onChange={(v) => set('targetPerDay', v)} />
        </View>
        {form.targetPerDay > 1 ? (
          <View className="mt-3">
            <TextField
              value={form.unit ?? ''}
              onChangeText={(v) => set('unit', v)}
              placeholder="Unidad (vasos, páginas, minutos…)"
              maxLength={16}
            />
          </View>
        ) : null}
      </Card>

      <FieldLabel>Recordatorio</FieldLabel>
      <Card className="py-1">
        <ListRow
          icon={Bell}
          title="Recordarme"
          subtitle={
            notificationsSupported
              ? form.reminderEnabled
                ? `Notificación a las ${form.reminderTime} los días programados`
                : 'Recibe una notificación local'
              : 'Las notificaciones solo funcionan en Android e iOS'
          }
          right={<Toggle value={form.reminderEnabled} onValueChange={(v) => set('reminderEnabled', v)} />}
          last
        />
      </Card>
      {form.reminderEnabled ? (
        <View className="mt-3">
          <TimeField label="Hora del aviso" value={form.reminderTime ?? '09:00'} onChange={(v) => set('reminderTime', v)} />
        </View>
      ) : null}
    </ModalScreen>
  );
}
