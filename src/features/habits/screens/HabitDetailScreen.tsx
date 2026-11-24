import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Archive,
  ArchiveArrowUp,
  Bell,
  CalendarRange,
  ChevronLeft,
  CircleCheck,
  Clock,
  Flame,
  Pause,
  Pencil,
  Percent,
  Play,
  Plus,
  Sigma,
  Trash,
  Trophy,
} from 'lucide-react-native';
import { formatEs, shiftKey } from '@/domain/dates';
import {
  bestStreak,
  currentStreak,
  describeFrequency,
  describeProgress,
  describeTarget,
  formatMinutes,
  formatNumber,
  getValue,
  habitStats,
  isPaused,
  isScheduledOn,
  progressRatio,
} from '@/domain/habits';
import { CATEGORIES } from '@/domain/categories';
import type { Habit } from '@/domain/types';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useLogIndex } from '@/features/habits/hooks/useLogIndex';
import { useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { confirmAction, showError } from '@/lib/dialogs';
import { goBack } from '@/lib/navigation';
import { Button, Card, IconBadge, IconButton, SectionHeader, StatTile, Txt } from '@/ui/primitives';
import { HeatCalendar, HeatLegend } from '@/features/calendar/components/HeatCalendar';
import { habitIcon } from '@/features/habits/components/habitIcons';
import { logRoute } from '@/features/habits/components/HabitCard';

function Pill({ children, icon: Icon, tone }: { children: string; icon?: typeof Bell; tone?: 'warning' }) {
  const t = useTheme();
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${tone ? 'bg-warning/15' : 'bg-subtle dark:bg-subtle-dark'}`}>
      {Icon ? <Icon size={12} color={tone ? t.warning : t.muted} /> : null}
      <Txt variant="caption" className={tone ? 'text-warning dark:text-warning' : undefined}>
        {children}
      </Txt>
    </View>
  );
}

function totalLabel(habit: Habit, total: number, completedDays: number) {
  switch (habit.trackingType) {
    case 'check':
      return { value: `${completedDays}`, hint: completedDays === 1 ? 'día completado' : 'días completados' };
    case 'duration':
      return { value: formatMinutes(total), hint: 'tiempo acumulado' };
    case 'count':
      return { value: `${total}`, hint: total === 1 ? 'vez en total' : 'veces en total' };
    case 'quantity':
      return { value: `${formatNumber(total)} ${habit.unit ?? ''}`, hint: 'acumulado' };
  }
}

export default function HabitDetailScreen() {
  const t = useTheme();
  const today = useToday();
  const { id } = useLocalSearchParams<{ id: string }>();
  const live = useHabitStore((s) => s.habits.find((h) => h.id === id));
  // Conserva el último valor para que la pantalla no salte mientras se cierra tras eliminar.
  const [snapshot, setSnapshot] = useState(live);
  if (live && live !== snapshot) setSnapshot(live);
  const habit = live ?? snapshot;
  const logs = useLogIndex();
  const { setValue, quickAction, setArchived, setPaused, deleteHabit } = useHabitStore.getState();
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);

  const stats = useMemo(() => {
    if (!habit) return null;
    const all = habitStats(habit, logs, habit.startDate, today, today);
    return {
      streak: currentStreak(habit, logs, today),
      best: bestStreak(habit, logs, today),
      month: habitStats(habit, logs, shiftKey(today, -29), today, today),
      all,
      daysWithData: Object.values(logs).filter((day) => (day[habit.id] ?? 0) > 0).length,
    };
  }, [habit, logs, today]);

  const getDay = useCallback(
    (d: string) => {
      if (!habit) return { ratio: null };
      const v = getValue(logs, habit.id, d);
      if (!isScheduledOn(habit, d)) return { ratio: v > 0 ? progressRatio(habit, v) : null };
      return { ratio: progressRatio(habit, v) };
    },
    [habit, logs],
  );

  if (!habit || !stats) return <Redirect href="/habits" />;

  const Icon = habitIcon(habit.icon);
  const valueToday = getValue(logs, habit.id, today);
  const doneToday = valueToday >= habit.target - 1e-6;
  const dueToday = isScheduledOn(habit, today);
  const paused = isPaused(habit);
  const total = totalLabel(habit, stats.all.totalValue, stats.all.completedDays);
  const run = (p: Promise<unknown>) => p.catch((e) => showError('No se pudo guardar', e));

  const onDayPress = (d: string) => {
    if (d > today) return;
    if (habit.trackingType === 'quantity' || habit.trackingType === 'duration') {
      router.push(logRoute(habit, d));
      return;
    }
    // Simple y frecuencia: el calendario marca o desmarca el día completo.
    const v = getValue(logs, habit.id, d);
    if (v < habit.target) haptics.success();
    run(setValue(habit.id, d, v >= habit.target ? 0 : habit.target));
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <View className="flex-row items-center justify-between px-5 py-2">
        <IconButton icon={ChevronLeft} label="Volver" onPress={() => goBack('/habits')} size={40} />
        <IconButton icon={Pencil} label="Editar" onPress={() => router.push(`/habit/edit/${habit.id}`)} size={40} />
      </View>

      <ScrollView contentContainerClassName="px-5 pb-16" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.springify().damping(18)} className="items-center pb-2 pt-2">
          <IconBadge icon={Icon} color={habit.color} size={76} />
          <Txt variant="title" className="mt-4 text-center">
            {habit.name}
          </Txt>
          {habit.description ? (
            <Txt variant="caption" className="mt-1 text-center">
              {habit.description}
            </Txt>
          ) : null}
          <View className="mt-3 flex-row flex-wrap justify-center gap-2">
            <Pill>{CATEGORIES[habit.category].label}</Pill>
            <Pill>{describeFrequency(habit)}</Pill>
            {habit.trackingType !== 'check' ? <Pill>{`Meta: ${describeTarget(habit)}`}</Pill> : null}
            {habit.suggestedTime ? <Pill icon={Clock}>{habit.suggestedTime}</Pill> : null}
            {habit.reminderTimes.length ? <Pill icon={Bell}>{[...habit.reminderTimes].sort().join(' · ')}</Pill> : null}
            {habit.endDate ? <Pill icon={CalendarRange}>{`Hasta ${formatEs(habit.endDate, 'd MMM yyyy')}`}</Pill> : null}
            {paused ? <Pill icon={Pause} tone="warning">Pausado</Pill> : null}
            {habit.archived ? <Pill tone="warning">Archivado</Pill> : null}
          </View>
        </Animated.View>

        {!habit.archived && dueToday ? (
          habit.trackingType === 'check' || habit.trackingType === 'count' ? (
            <Button
              className="mt-5"
              variant={doneToday ? 'secondary' : 'primary'}
              icon={CircleCheck}
              title={
                doneToday
                  ? 'Completado hoy · tocar para deshacer'
                  : habit.trackingType === 'count'
                    ? `Sumar una vez (${describeProgress(habit, valueToday)})`
                    : 'Marcar como hecho hoy'
              }
              onPress={() => {
                if (!doneToday && (habit.trackingType === 'check' || valueToday + 1 >= habit.target)) haptics.success();
                run(quickAction(habit.id, today));
              }}
            />
          ) : (
            <Button
              className="mt-5"
              variant={doneToday ? 'secondary' : 'primary'}
              icon={Plus}
              title={`Registrar progreso · ${describeProgress(habit, valueToday)}`}
              onPress={() => router.push(logRoute(habit, today))}
            />
          )
        ) : null}
        {paused ? (
          <Txt variant="caption" className="mt-3 text-center">
            En pausa desde el {formatEs(habit.pauses[habit.pauses.length - 1].from, "d 'de' MMMM")}. No aparece en tus días ni rompe rachas.
          </Txt>
        ) : null}

        <View className="mt-5 flex-row gap-3">
          <StatTile icon={Flame} color={t.warning} label="Racha actual" value={`${stats.streak}`} hint={stats.streak === 1 ? 'día' : 'días'} />
          <StatTile icon={Trophy} color={habit.color} label="Mejor racha" value={`${stats.best}`} hint={stats.best === 1 ? 'día' : 'días'} />
        </View>
        <View className="mt-3 flex-row gap-3">
          <StatTile
            icon={Percent}
            color={t.success}
            label="Últimos 30 días"
            value={`${Math.round(stats.month.rate * 100)}%`}
            hint={`${stats.month.completedDays} de ${stats.month.scheduledDays} días`}
          />
          <StatTile icon={Sigma} color={t.brand} label={`Desde ${formatEs(habit.startDate, 'd MMM')}`} value={total.value} hint={total.hint} />
        </View>

        <SectionHeader title="Historial" />
        <Card className="px-2 pb-3">
          <HeatCalendar today={today} getDay={getDay} onSelect={onDayPress} color={habit.color} firstDay={weekStartsOn} />
          <HeatLegend color={habit.color} />
        </Card>
        <Txt variant="caption" className="mt-2 text-center">
          {habit.trackingType === 'check' || habit.trackingType === 'count'
            ? 'Toca un día pasado para marcarlo o desmarcarlo.'
            : 'Toca un día pasado para registrar o corregir su progreso.'}
        </Txt>

        <SectionHeader title="Opciones" />
        <View className="gap-3">
          {!habit.archived ? (
            <Button
              variant="secondary"
              icon={paused ? Play : Pause}
              title={paused ? 'Reanudar hábito' : 'Pausar hábito'}
              onPress={() => {
                haptics.light();
                run(setPaused(habit.id, !paused));
              }}
            />
          ) : null}
          <Button
            variant="secondary"
            icon={habit.archived ? ArchiveArrowUp : Archive}
            title={habit.archived ? 'Restaurar hábito' : 'Archivar hábito'}
            onPress={() => run(setArchived(habit.id, !habit.archived))}
          />
          <Button
            variant="danger"
            icon={Trash}
            title="Eliminar hábito"
            onPress={() =>
              confirmAction(
                'Eliminar hábito',
                stats.daysWithData > 0
                  ? `Se eliminará «${habit.name}» junto con su historial de ${stats.daysWithData} ${stats.daysWithData === 1 ? 'día' : 'días'} registrados. Esta acción no se puede deshacer.\n\nSi solo quieres dejar de verlo, archívalo o páusalo.`
                  : `Se eliminará «${habit.name}». Esta acción no se puede deshacer.`,
                'Eliminar',
                async () => {
                  haptics.warning();
                  goBack('/habits');
                  await deleteHabit(habit.id).catch((e) => showError('No se pudo eliminar', e));
                },
              )
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
