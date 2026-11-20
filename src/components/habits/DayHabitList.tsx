import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { CalendarCheck, Plus } from 'lucide-react-native';
import type { DateKey } from '@/domain/types';
import { currentStreak, getCount, habitsForDay } from '@/domain/habits';
import { useHabitStore } from '@/stores/useHabitStore';
import { Button, EmptyState, Txt } from '@/components/ui/primitives';
import { HabitCard } from './HabitCard';

/** Hábitos programados para un día, con los pendientes primero. */
export function DayHabitList({ date, today, emptyCta = true }: { date: DateKey; today: DateKey; emptyCta?: boolean }) {
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const toggle = useHabitStore((s) => s.toggle);
  const hasAnyHabit = habits.some((h) => !h.archived);

  const { pending, done } = useMemo(() => {
    const due = habitsForDay(habits, date);
    const isDone = (id: string, target: number) => getCount(logs, id, date) >= target;
    return {
      pending: due.filter((h) => !isDone(h.id, h.targetPerDay)),
      done: due.filter((h) => isDone(h.id, h.targetPerDay)),
    };
  }, [habits, logs, date]);

  if (pending.length + done.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={hasAnyHabit ? 'Día libre' : 'Empieza tu primera rutina'}
        description={
          hasAnyHabit
            ? 'No hay hábitos programados para este día.'
            : 'Crea un hábito y márcalo cada día para construir tu racha.'
        }
        action={
          emptyCta && !hasAnyHabit ? (
            <Button title="Crear hábito" icon={Plus} onPress={() => router.push('/habit/new')} />
          ) : undefined
        }
      />
    );
  }

  const render = (list: typeof pending) =>
    list.map((h, i) => (
      <Animated.View key={h.id} entering={FadeInDown.delay(i * 45).springify().damping(18)} layout={LinearTransition.springify().damping(20)}>
        <HabitCard
          habit={h}
          count={getCount(logs, h.id, date)}
          streak={date === today ? currentStreak(h, logs, today) : 0}
          onToggle={() => toggle(h.id, date)}
        />
      </Animated.View>
    ));

  return (
    <View>
      {render(pending)}
      {done.length > 0 ? (
        <>
          <Txt variant="overline" className="mb-3 mt-3">
            Completados · {done.length}
          </Txt>
          {render(done)}
        </>
      ) : null}
    </View>
  );
}
