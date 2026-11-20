import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { confirmAction } from '@/lib/dialogs';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Archive, ArchiveArrowUp, Bell, ChevronLeft, Flame, Pencil, Percent, Trash, Trophy, CircleCheck } from 'lucide-react-native';
import { formatEs, shiftKey } from '@/domain/dates';
import { bestStreak, currentStreak, describeFrequency, getCount, habitStats, isScheduledOn } from '@/domain/habits';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { Button, Card, IconBadge, IconButton, SectionHeader, StatTile, Txt } from '@/components/ui/primitives';
import { HeatCalendar, HeatLegend } from '@/components/calendar/HeatCalendar';
import { habitIcon } from '@/components/habits/habitIcons';


export default function HabitDetailScreen() {
  const t = useTheme();
  const today = useToday();
  const { id } = useLocalSearchParams<{ id: string }>();
  const live = useHabitStore((s) => s.habits.find((h) => h.id === id));
  // Conserva el último valor para que la pantalla no salte mientras se cierra tras eliminar.
  const [snapshot, setSnapshot] = useState(live);
  if (live && live !== snapshot) setSnapshot(live);
  const habit = live ?? snapshot;
  const logs = useHabitStore((s) => s.logs);
  const { setCount, toggle, setArchived, deleteHabit } = useHabitStore.getState();
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);

  const stats = useMemo(() => {
    if (!habit) return null;
    return {
      streak: currentStreak(habit, logs, today),
      best: bestStreak(habit, logs, today),
      month: habitStats(habit, logs, shiftKey(today, -29), today, today),
      all: habitStats(habit, logs, habit.startDate, today, today),
    };
  }, [habit, logs, today]);

  const getDay = useCallback(
    (d: string) => {
      if (!habit) return { ratio: null };
      const count = getCount(logs, habit.id, d);
      if (!isScheduledOn(habit, d)) return { ratio: count > 0 ? Math.min(1, count / habit.targetPerDay) : null };
      return { ratio: Math.min(1, count / habit.targetPerDay) };
    },
    [habit, logs],
  );

  if (!habit || !stats) return <Redirect href="/habits" />;

  const Icon = habitIcon(habit.icon);
  const countToday = getCount(logs, habit.id, today);
  const doneToday = countToday >= habit.targetPerDay;
  const dueToday = isScheduledOn(habit, today);

  const onDayPress = (d: string) => {
    if (d > today) return;
    const count = getCount(logs, habit.id, d);
    // En el calendario se marca/desmarca el día completo.
    setCount(habit.id, d, count >= habit.targetPerDay ? 0 : habit.targetPerDay);
    if (count < habit.targetPerDay) haptics.success();
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <View className="flex-row items-center justify-between px-5 py-2">
        <IconButton icon={ChevronLeft} label="Volver" onPress={() => goBack()} size={40} />
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
            <View className="rounded-full bg-subtle px-3 py-1 dark:bg-subtle-dark">
              <Txt variant="caption">{describeFrequency(habit)}</Txt>
            </View>
            {habit.targetPerDay > 1 ? (
              <View className="rounded-full bg-subtle px-3 py-1 dark:bg-subtle-dark">
                <Txt variant="caption">
                  Meta: {habit.targetPerDay} {habit.unit ?? 'veces'}
                </Txt>
              </View>
            ) : null}
            {habit.reminderEnabled && habit.reminderTime ? (
              <View className="flex-row items-center gap-1 rounded-full bg-subtle px-3 py-1 dark:bg-subtle-dark">
                <Bell size={12} color={t.muted} />
                <Txt variant="caption">{habit.reminderTime}</Txt>
              </View>
            ) : null}
            {habit.archived ? (
              <View className="rounded-full bg-warning/15 px-3 py-1">
                <Txt variant="caption" className="text-warning dark:text-warning">
                  Archivado
                </Txt>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {!habit.archived && dueToday ? (
          <Button
            className="mt-5"
            variant={doneToday ? 'secondary' : 'primary'}
            icon={CircleCheck}
            title={
              doneToday
                ? 'Completado hoy · tocar para deshacer'
                : habit.targetPerDay > 1
                  ? `Sumar uno (${countToday}/${habit.targetPerDay})`
                  : 'Marcar como hecho hoy'
            }
            onPress={() => {
              if (!doneToday && (habit.targetPerDay <= 1 || countToday + 1 >= habit.targetPerDay)) haptics.success();
              toggle(habit.id, today);
            }}
          />
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
          <StatTile
            icon={CircleCheck}
            color={t.brand}
            label="Total"
            value={`${stats.all.completedDays}`}
            hint={`desde ${formatEs(habit.startDate, "d MMM yyyy")}`}
          />
        </View>

        <SectionHeader title="Historial" />
        <Card className="px-2 pb-3">
          <HeatCalendar today={today} getDay={getDay} onSelect={onDayPress} color={habit.color} firstDay={weekStartsOn} />
          <HeatLegend color={habit.color} />
        </Card>
        <Txt variant="caption" className="mt-2 text-center">
          Toca un día pasado para marcarlo o desmarcarlo.
        </Txt>

        <SectionHeader title="Opciones" />
        <View className="gap-3">
          <Button
            variant="secondary"
            icon={habit.archived ? ArchiveArrowUp : Archive}
            title={habit.archived ? 'Restaurar hábito' : 'Archivar hábito'}
            onPress={() => setArchived(habit.id, !habit.archived)}
          />
          <Button
            variant="danger"
            icon={Trash}
            title="Eliminar hábito"
            onPress={() =>
              confirmAction('Eliminar hábito', `Se eliminará "${habit.name}" y su historial. Esta acción no se puede deshacer.`, 'Eliminar', async () => {
                haptics.warning();
                goBack();
                await deleteHabit(habit.id);
              })
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
