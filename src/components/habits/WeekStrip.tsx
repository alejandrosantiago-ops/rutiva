import { View, Text } from 'react-native';
import { startOfWeek } from 'date-fns';
import { fromKey, shiftKey, toKey, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import { dayProgress } from '@/domain/habits';
import type { DateKey, Habit, LogIndex } from '@/domain/types';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { ProgressRing } from '@/components/ui/progress';
import { PressableScale, cx } from '@/components/ui/primitives';

/** Tira semanal con un mini anillo de progreso por día. */
export function WeekStrip({
  habits,
  logs,
  today,
  selected,
  onSelect,
  weekStartsOn,
}: {
  habits: Habit[];
  logs: LogIndex;
  today: DateKey;
  selected: DateKey;
  onSelect: (d: DateKey) => void;
  weekStartsOn: 0 | 1;
}) {
  const t = useTheme();
  const start = toKey(startOfWeek(fromKey(selected), { weekStartsOn }));
  const days = Array.from({ length: 7 }, (_, i) => shiftKey(start, i));

  return (
    <View className="flex-row justify-between rounded-3xl border border-line bg-card px-2 py-3 dark:border-line-dark dark:bg-card-dark">
      {days.map((d) => {
        const future = d > today;
        const isSel = d === selected;
        const p = dayProgress(habits, logs, d);
        return (
          <PressableScale
            key={d}
            disabled={future}
            scaleTo={0.9}
            onPress={() => {
              haptics.selection();
              onSelect(d);
            }}
            accessibilityLabel={`Ver ${d}`}
            className={cx('items-center rounded-2xl px-1.5 py-1.5', isSel && 'bg-brand-50 dark:bg-brand-900/50', future && 'opacity-40')}
          >
            <Text className={cx('mb-1.5 text-[11px] font-semibold', isSel ? 'text-brand-500 dark:text-brand-300' : 'text-muted dark:text-muted-dark')}>
              {WEEKDAY_SHORT[weekdayOf(d)]}
            </Text>
            <ProgressRing progress={future ? 0 : p.ratio} size={34} stroke={3.5} color={p.ratio >= 1 ? t.success : t.brand}>
              <Text
                className={cx(
                  'text-[12px] font-bold',
                  d === today ? 'text-brand-500 dark:text-brand-300' : 'text-ink dark:text-ink-dark',
                )}
              >
                {fromKey(d).getDate()}
              </Text>
            </ProgressRing>
          </PressableScale>
        );
      })}
    </View>
  );
}
