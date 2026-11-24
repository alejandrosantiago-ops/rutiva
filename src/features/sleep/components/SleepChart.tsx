import { Text, View } from 'react-native';
import { formatDurationShort, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import type { DateKey, SleepLog } from '@/domain/types';
import { useTheme } from '@/theme/colors';
import { AnimatedBar } from '@/ui/progress';
import { cx } from '@/ui/primitives';

const CHART_H = 140;

/** Barras de horas dormidas por noche con línea de meta. */
export function SleepChart({
  series,
  goalMinutes,
  today,
}: {
  series: { date: DateKey; log: SleepLog | null }[];
  goalMinutes: number;
  today: DateKey;
}) {
  const t = useTheme();
  const maxMinutes = Math.max(goalMinutes * 1.25, ...series.map((s) => s.log?.durationMinutes ?? 0));
  const goalY = (goalMinutes / maxMinutes) * CHART_H;

  return (
    <View>
      <View style={{ height: CHART_H }} className="relative flex-row items-end justify-between px-1">
        {/* Línea de meta */}
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 flex-row items-center"
          style={{ bottom: goalY }}
        >
          <View className="h-px flex-1" style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: t.muted, opacity: 0.6 }} />
          <Text className="ml-1 text-[10px] font-semibold text-muted dark:text-muted-dark">{formatDurationShort(goalMinutes)}</Text>
        </View>
        {series.map(({ date, log }, i) => {
          const minutes = log?.durationMinutes ?? 0;
          const hit = minutes >= goalMinutes;
          return (
            <View key={date} className="flex-1 items-center justify-end">
              <AnimatedBar
                ratio={minutes / maxMinutes}
                maxHeight={CHART_H}
                color={hit ? t.sleep : `${t.sleep}88`}
                width={series.length > 10 ? 8 : 20}
                delay={i * 40}
              />
            </View>
          );
        })}
      </View>
      {series.length <= 10 ? (
        <View className="mt-2 flex-row justify-between px-1">
          {series.map(({ date, log }) => (
            <View key={date} className="flex-1 items-center">
              <Text
                className={cx(
                  'text-[11px] font-semibold',
                  date === today ? 'text-sleep' : 'text-muted dark:text-muted-dark',
                )}
              >
                {WEEKDAY_SHORT[weekdayOf(date)]}
              </Text>
              <Text className="mt-0.5 text-[10px] text-muted dark:text-muted-dark">
                {log ? `${Math.floor(log.durationMinutes / 60)}h${log.durationMinutes % 60 ? String(log.durationMinutes % 60).padStart(2, '0') : ''}` : '–'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
