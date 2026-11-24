import { View } from 'react-native';
import { router } from 'expo-router';
import { Check, Circle, X } from 'lucide-react-native';
import { describeProgress, getValue, habitOn, habitsForDay, isDoneOn, isPausedOn, progressRatio } from '@/domain/habits';
import type { DateKey, Habit, LogIndex } from '@/domain/types';
import { useTheme } from '@/theme/colors';
import { Card, IconBadge, PressableScale, Txt, cx } from '@/ui/primitives';
import { ProgressBar } from '@/ui/progress';
import { habitIcon } from '@/features/habits/components/habitIcons';

function statusText(habit: Habit, value: number, date: DateKey, today: DateKey) {
  const done = isDoneOn(habit, { [date]: { [habit.id]: value } }, date);
  if (habit.trackingType === 'check') return done ? 'Completado' : date < today ? 'No completado' : 'Pendiente';
  const progress = describeProgress(habit, value);
  if (done) return `${progress} · completado`;
  return value === 0 && date < today ? `${progress} · no completado` : progress;
}

/**
 * Resumen de una fecha: cada hábito programado con su estado y el progreso
 * total. Usa la programación y la meta vigentes ese día.
 */
export function DaySummary({
  date,
  today,
  habits,
  logs,
  focusId,
}: {
  date: DateKey;
  today: DateKey;
  habits: Habit[];
  logs: LogIndex;
  /** Si se filtra por un hábito, se destaca. */
  focusId?: string | null;
}) {
  const t = useTheme();
  const due = habitsForDay(habits, date);
  const pausedFocus = focusId ? habits.find((h) => h.id === focusId) : null;
  const completed = due.filter((h) => isDoneOn(h, logs, date)).length;
  const ratio = due.length ? due.reduce((a, h) => a + progressRatio(h, getValue(logs, h.id, date), date), 0) / due.length : 0;

  return (
    <Card>
      {due.length === 0 ? (
        <Txt variant="caption">No había hábitos programados este día.</Txt>
      ) : (
        <>
          {due.map((h, i) => {
            const v = getValue(logs, h.id, date);
            const done = isDoneOn(h, logs, date);
            const asOf = habitOn(h, date);
            const Status = done ? Check : date < today ? X : Circle;
            return (
              <PressableScale
                key={h.id}
                scaleTo={0.98}
                onPress={() => router.push(`/habit/${h.id}`)}
                className={cx(
                  'flex-row items-center gap-3 py-2.5',
                  i < due.length - 1 && 'border-b border-line dark:border-line-dark',
                  focusId && focusId !== h.id && 'opacity-50',
                )}
              >
                <IconBadge icon={habitIcon(h.icon)} color={h.color} size={34} />
                <View className="flex-1">
                  <Txt variant="label" numberOfLines={1}>
                    {h.name}
                  </Txt>
                  <Txt variant="caption" numberOfLines={1}>
                    {statusText(asOf, v, date, today)}
                  </Txt>
                </View>
                <Status size={18} color={done ? t.success : date < today ? t.danger : t.muted} strokeWidth={2.6} />
              </PressableScale>
            );
          })}
          <View className="mt-3 flex-row items-baseline justify-between">
            <Txt variant="label">
              Progreso · {completed} de {due.length}
            </Txt>
            <Txt variant="heading" className="text-brand-500 dark:text-brand-300">
              {Math.round(ratio * 100)}%
            </Txt>
          </View>
          <ProgressBar className="mt-2" progress={ratio} color={ratio >= 1 ? t.success : t.brand} />
        </>
      )}
      {pausedFocus && isPausedOn(pausedFocus, date) ? (
        <Txt variant="caption" className="mt-3">
          «{pausedFocus.name}» estaba en pausa este día.
        </Txt>
      ) : null}
    </Card>
  );
}
