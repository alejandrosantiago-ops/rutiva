import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarCheck, ChartColumn, Flame, Moon, Percent, Trophy } from 'lucide-react-native';
import { formatDurationShort, formatEs, orderedWeekdays, shiftKey, WEEKDAY_NAMES, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import { dailySeries, habitRanking, overview, weekdayPerformance } from '@/domain/stats';
import { logsInRange, summarizeSleep } from '@/domain/sleep';
import { isActive } from '@/domain/habits';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSleepStore } from '@/stores/useSleepStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useToday } from '@/hooks/useToday';
import { useLogIndex } from '@/hooks/useLogIndex';
import { useTheme } from '@/theme/colors';
import { Screen } from '@/components/ui/layout';
import { Card, EmptyState, IconBadge, PressableScale, SectionHeader, StatTile, Txt } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { Segmented } from '@/components/ui/form';
import { BarChart } from '@/components/stats/BarChart';
import { habitIcon } from '@/components/habits/habitIcons';

type Range = '7' | '30' | '90';

export default function StatsScreen() {
  const t = useTheme();
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const sleepLogs = useSleepStore((s) => s.logs);
  const { weekStartsOn, sleepGoalMinutes } = useSettingsStore((s) => s.settings);
  const [range, setRange] = useState<Range>('7');
  const days = Number(range);

  const data = useMemo(() => {
    const series = dailySeries(habits, logs, today, days);
    // En 90 días se agrupa por semanas para que el gráfico sea legible.
    let values: number[];
    let labels: string[] | undefined;
    if (days === 7) {
      values = series.map((p) => p.ratio);
      labels = series.map((p) => WEEKDAY_SHORT[weekdayOf(p.date)]);
    } else if (days === 30) {
      values = series.map((p) => p.ratio);
      labels = series.map((p, i) => (i % 5 === 0 ? formatEs(p.date, 'd') : ''));
    } else {
      values = [];
      labels = [];
      for (let i = 0; i < series.length; i += 7) {
        const chunk = series.slice(i, i + 7).filter((p) => p.scheduled > 0);
        values.push(chunk.length ? chunk.reduce((a, p) => a + p.ratio, 0) / chunk.length : 0);
        labels.push(i % 21 === 0 ? formatEs(series[i].date, 'd MMM') : '');
      }
    }
    return {
      values,
      labels,
      overview: overview(habits, logs, today, days, today),
      weekdays: weekdayPerformance(habits, logs, today, days, today),
      ranking: habitRanking(habits, logs, today, days, today),
      sleep: summarizeSleep(logsInRange(sleepLogs, shiftKey(today, -(days - 1)), today), sleepGoalMinutes),
    };
  }, [habits, logs, sleepLogs, today, days, sleepGoalMinutes]);

  const hasHabits = habits.some(isActive);
  const o = data.overview;
  const bestDay = data.weekdays.reduce((best, v, i) => (v > data.weekdays[best] ? i : best), 0);

  return (
    <Screen subtitle="Tu progreso" title="Estadísticas">
      <View className="mt-4">
        <Segmented<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7 días' },
            { value: '30', label: '30 días' },
            { value: '90', label: '90 días' },
          ]}
        />
      </View>

      {!hasHabits ? (
        <EmptyState icon={ChartColumn} title="Sin datos todavía" description="Crea hábitos y regístralos: aquí verás tus tendencias, rachas y mejores días." />
      ) : (
        <>
          <View className="mt-4 flex-row gap-3">
            <StatTile icon={Percent} color={t.brand} label="Cumplimiento" value={`${Math.round(o.completionRate * 100)}%`} hint={`últimos ${days} días`} />
            <StatTile icon={CalendarCheck} color={t.success} label="Días perfectos" value={`${o.perfectDays}`} hint={`${o.activeDays} días activos`} />
          </View>
          <View className="mt-3 flex-row gap-3">
            <StatTile icon={Flame} color={t.warning} label="Racha actual" value={`${o.bestCurrentStreak}`} hint="la más larga ahora" />
            <StatTile icon={Trophy} color="#A855F7" label="Mejor racha" value={`${o.bestEverStreak}`} hint="histórica" />
          </View>

          <SectionHeader title={days === 90 ? 'Cumplimiento semanal' : 'Cumplimiento diario'} />
          <Card className="pt-5">
            <BarChart values={data.values} labels={data.labels} />
          </Card>

          <SectionHeader title="Por día de la semana" />
          <Card>
            {orderedWeekdays(weekStartsOn).map((d, i) => (
              <View key={d} className={`flex-row items-center gap-3 ${i > 0 ? 'mt-3' : ''}`}>
                <Txt variant="label" className="w-20">
                  {WEEKDAY_NAMES[d]}
                </Txt>
                <View className="flex-1">
                  <ProgressBar progress={data.weekdays[d]} color={d === bestDay && data.weekdays[d] > 0 ? t.success : t.brand} />
                </View>
                <Txt variant="caption" className="w-10 text-right">
                  {Math.round(data.weekdays[d] * 100)}%
                </Txt>
              </View>
            ))}
            {data.weekdays[bestDay] > 0 ? (
              <Txt variant="caption" className="mt-4">
                Tu mejor día es el <Text className="font-semibold text-ink dark:text-ink-dark">{WEEKDAY_NAMES[bestDay].toLowerCase()}</Text>.
              </Txt>
            ) : null}
          </Card>

          <SectionHeader title="Ranking de hábitos" />
          <Card className="py-2">
            {data.ranking.map(({ habit, rate, streak }, i) => (
              <PressableScale
                key={habit.id}
                scaleTo={0.98}
                onPress={() => router.push(`/habit/${habit.id}`)}
                className={`flex-row items-center gap-3 py-3 ${i < data.ranking.length - 1 ? 'border-b border-line dark:border-line-dark' : ''}`}
              >
                <IconBadge icon={habitIcon(habit.icon)} color={habit.color} size={38} />
                <View className="flex-1">
                  <View className="mb-1.5 flex-row items-center justify-between">
                    <Txt variant="label" numberOfLines={1} className="flex-1 pr-2">
                      {habit.name}
                    </Txt>
                    <Txt variant="label">{Math.round(rate * 100)}%</Txt>
                  </View>
                  <ProgressBar progress={rate} color={habit.color} height={6} />
                </View>
                {streak > 0 ? (
                  <View className="flex-row items-center gap-0.5">
                    <Flame size={13} color={t.warning} />
                    <Text className="text-[12px] font-bold text-warning">{streak}</Text>
                  </View>
                ) : null}
              </PressableScale>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="Sueño en el periodo" />
      <PressableScale scaleTo={0.98} onPress={() => router.push('/sleep')}>
        <Card className="flex-row items-center gap-4">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sleep/15">
            <Moon size={22} color={t.sleep} />
          </View>
          <View className="flex-1">
            {data.sleep.nights ? (
              <>
                <Txt variant="heading">{formatDurationShort(data.sleep.avgMinutes)} de media</Txt>
                <Txt variant="caption" className="mt-0.5">
                  {data.sleep.nights} noches · meta cumplida {Math.round(data.sleep.goalHitRate * 100)}%
                </Txt>
              </>
            ) : (
              <>
                <Txt variant="heading">Sin registros de sueño</Txt>
                <Txt variant="caption" className="mt-0.5">
                  Registra tus noches para ver tu promedio.
                </Txt>
              </>
            )}
          </View>
        </Card>
      </PressableScale>
    </Screen>
  );
}
