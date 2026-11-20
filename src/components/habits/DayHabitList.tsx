import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { CalendarCheck, Plus } from 'lucide-react-native';
import type { DateKey } from '@/domain/types';
import { currentStreak, getValue, habitsForDay, isDoneOn } from '@/domain/habits';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useLogIndex } from '@/hooks/useLogIndex';
import { showError } from '@/lib/dialogs';
import { Button, EmptyState, Txt } from '@/components/ui/primitives';
import { HabitCard } from './HabitCard';

/** Hábitos programados para un día, con los pendientes primero. */
export function DayHabitList({ date, today, emptyCta = true }: { date: DateKey; today: DateKey; emptyCta?: boolean }) {
  const habits = useHabitStore((s) => s.habits);
  const quickAction = useHabitStore((s) => s.quickAction);
  const activeTimer = useSettingsStore((s) => s.settings.activeTimer);
  const logs = useLogIndex();
  const hasAnyHabit = habits.some((h) => !h.archived);

  const { pending, done } = useMemo(() => {
    const due = habitsForDay(habits, date);
    return {
      pending: due.filter((h) => !isDoneOn(h, logs, date)),
      done: due.filter((h) => isDoneOn(h, logs, date)),
    };
  }, [habits, logs, date]);

  if (pending.length + done.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title={hasAnyHabit ? 'Día libre' : 'Empieza tu primera rutina'}
        description={
          hasAnyHabit ? 'No hay hábitos programados para este día.' : 'Crea un hábito y regístralo cada día para construir tu racha.'
        }
        action={
          emptyCta && !hasAnyHabit ? <Button title="Crear hábito" icon={Plus} onPress={() => router.push('/habit/new')} /> : undefined
        }
      />
    );
  }

  const render = (list: typeof pending) =>
    list.map((h, i) => (
      <Animated.View key={h.id} entering={FadeInDown.delay(i * 45).springify().damping(18)} layout={LinearTransition.springify().damping(20)}>
        <HabitCard
          habit={h}
          date={date}
          value={getValue(logs, h.id, date)}
          streak={date === today ? currentStreak(h, logs, today) : 0}
          timerRunning={activeTimer?.habitId === h.id && activeTimer.date === date}
          onQuick={() => quickAction(h.id, date).catch((e) => showError('No se pudo guardar', e))}
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
