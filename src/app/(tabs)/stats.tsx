import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { startOfMonth, startOfWeek } from 'date-fns';
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  Dumbbell,
  Flame,
  Moon,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trophy,
} from 'lucide-react-native';
import { formatDurationShort, formatEs, fromKey, orderedWeekdays, shiftKey, toKey, WEEKDAY_NAMES, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import { activityGrid, compliance, dailySeries, habitRanking, minutesByCategory, weekdayPerformance, weeklySeries } from '@/domain/stats';
import { bestPerfectDayStreak, formatMinutes, perfectDayStreak } from '@/domain/habits';
import { logsInRange, summarizeSleep } from '@/domain/sleep';
import { formatWater, waterSeries } from '@/domain/water';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSleepStore } from '@/stores/useSleepStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useToday } from '@/hooks/useToday';
import { useLogIndex, useWaterTotals } from '@/hooks/useLogIndex';
import { useTheme, WATER_COLOR } from '@/theme/colors';
import { Screen } from '@/components/ui/layout';
import { Card, EmptyState, IconBadge, PressableScale, SectionHeader, StatTile, Txt } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { Segmented } from '@/components/ui/form';
import { BarChart } from '@/components/stats/BarChart';
import { LineChart } from '@/components/stats/LineChart';
import { ActivityGrid } from '@/components/stats/ActivityGrid';
import { habitIcon } from '@/components/habits/habitIcons';
import type { HabitRanking } from '@/domain/stats';

type Range = '7' | '30' | '90';
const pct = (r: number) => `${Math.round(r * 100)}%`;

function RankingList({ items, empty }: { items: HabitRanking[]; empty: string }) {
  const t = useTheme();
  if (items.length === 0) return <Txt variant="caption">{empty}</Txt>;
  return (
    <>
      {items.map(({ habit, rate, streak, scheduledDays }, i) => (
        <PressableScale
          key={habit.id}
          scaleTo={0.98}
          onPress={() => router.push(`/habit/${habit.id}`)}
          className={`flex-row items-center gap-3 py-3 ${i < items.length - 1 ? 'border-b border-line dark:border-line-dark' : ''}`}
        >
          <IconBadge icon={habitIcon(habit.icon)} color={habit.color} size={36} />
          <View className="flex-1">
            <View className="mb-1.5 flex-row items-center justify-between">
              <Txt variant="label" numberOfLines={1} className="flex-1 pr-2">
                {habit.name}
              </Txt>
              <Txt variant="label">{pct(rate)}</Txt>
            </View>
            <ProgressBar progress={rate} color={habit.color} height={6} />
            <Txt variant="caption" className="mt-1 text-[11px]">
              {scheduledDays} {scheduledDays === 1 ? 'día programado' : 'días programados'}
            </Txt>
          </View>
          {streak > 0 ? (
            <View className="flex-row items-center gap-0.5">
              <Flame size={13} color={t.warning} />
              <Text className="text-[12px] font-bold text-warning">{streak}</Text>
            </View>
          ) : null}
        </PressableScale>
      ))}
    </>
  );
}

export default function StatsScreen() {
  const t = useTheme();
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const sleepLogs = useSleepStore((s) => s.logs);
  const waterTotals = useWaterTotals();
  const { weekStartsOn, sleepGoalMinutes, waterGoalMl, waterUnit } = useSettingsStore((s) => s.settings);
  const [range, setRange] = useState<Range>('30');
  const days = Number(range);
  const from = shiftKey(today, -(days - 1));

  const data = useMemo(() => {
    const series = dailySeries(habits, logs, today, days);
    const weekStart = toKey(startOfWeek(fromKey(today), { weekStartsOn }));
    const monthStart = toKey(startOfMonth(fromKey(today)));
    const ranking = habitRanking(habits, logs, today, days, today);
    // Sin solapamiento: con pocos hábitos se reparten entre "mayor" y "menor".
    const topCount = Math.min(3, Math.ceil(ranking.length / 2));
    const top = ranking.slice(0, topCount);
    const bottom = ranking.slice(topCount).reverse().slice(0, 3);

    // Agua: media sobre los días del periodo desde el primer registro (no inventa ceros previos).
    const water = waterSeries(waterTotals, today, days);
    const firstWater = water.findIndex((w) => w.ml > 0);
    const waterDays = firstWater === -1 ? [] : water.slice(firstWater);
    const waterAvg = waterDays.length ? waterDays.reduce((a, w) => a + w.ml, 0) / waterDays.length : 0;

    const training = minutesByCategory(habits, logs, 'exercise', from, today);
    const study = minutesByCategory(habits, logs, 'study', from, today);

    return {
      line: series.map((p) => (p.scheduled ? p.ratio : null)),
      lineLabels: [formatEs(series[0].date, 'd MMM'), formatEs(series[Math.floor(series.length / 2)].date, 'd MMM'), 'Hoy'],
      todayRatio: series[series.length - 1],
      week: compliance(habits, logs, weekStart, today, today),
      month: compliance(habits, logs, monthStart, today, today),
      period: compliance(habits, logs, from, today, today),
      weeks: weeklySeries(habits, logs, today, 12, weekStartsOn),
      grid: activityGrid(habits, logs, today, 17, weekStartsOn),
      weekdays: weekdayPerformance(habits, logs, today, days, today),
      streak: perfectDayStreak(habits, logs, today),
      best: bestPerfectDayStreak(habits, logs, today),
      top,
      bottom,
      water,
      waterAvg,
      training,
      study,
      sleep: summarizeSleep(logsInRange(sleepLogs, from, today), sleepGoalMinutes),
    };
  }, [habits, logs, today, days, from, weekStartsOn, waterTotals, sleepLogs, sleepGoalMinutes]);

  const hasHabits = habits.some((h) => !h.deletedAt);
  const bestDay = data.weekdays.reduce((best, v, i) => (v > data.weekdays[best] ? i : best), 0);
  const waterMax = Math.max(waterGoalMl, ...data.water.map((w) => w.ml));
  const todayWater = waterTotals[today] ?? 0;

  return (
    <Screen subtitle="Tu progreso real" title="Estadísticas">
      {!hasHabits ? (
        <EmptyState icon={ChartColumn} title="Sin datos todavía" description="Crea hábitos y regístralos: aquí verás tus tendencias, rachas y mejores días." />
      ) : (
        <>
          {/* Cumplimiento: día, semana, mes */}
          <View className="mt-4 flex-row gap-3">
            <StatTile
              icon={Sun}
              color={t.brand}
              label="Hoy"
              value={data.todayRatio.scheduled ? pct(data.todayRatio.ratio) : '–'}
              hint={data.todayRatio.scheduled ? `${data.todayRatio.completed} de ${data.todayRatio.scheduled}` : 'sin hábitos'}
            />
            <StatTile
              icon={CalendarDays}
              color={t.success}
              label="Esta semana"
              value={data.week.scheduled ? pct(data.week.rate) : '–'}
              hint={`${data.week.completed} de ${data.week.scheduled}`}
            />
            <StatTile
              icon={CalendarCheck}
              color="#A855F7"
              label="Este mes"
              value={data.month.scheduled ? pct(data.month.rate) : '–'}
              hint={`${data.month.completed} de ${data.month.scheduled}`}
            />
          </View>
          <View className="mt-3 flex-row gap-3">
            <StatTile icon={Flame} color={t.warning} label="Racha actual" value={`${data.streak}`} hint="días con todo cumplido" />
            <StatTile icon={Trophy} color="#EAB308" label="Mejor racha" value={`${data.best}`} hint="histórica" />
          </View>

          <View className="mt-6">
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

          <SectionHeader title="Cumplimiento diario" action={<Txt variant="label">{data.period.scheduled ? pct(data.period.rate) : '–'}</Txt>} />
          <Card className="pt-4">
            <LineChart values={data.line} labels={data.lineLabels} />
            <Txt variant="caption" className="mt-3">
              Los días sin hábitos programados (o anteriores a su creación) no se cuentan.
            </Txt>
          </Card>

          <SectionHeader title="Cumplimiento semanal" />
          <Card className="pt-5">
            <BarChart
              values={data.weeks.map((w) => w.rate)}
              labels={data.weeks.map((w, i) => (i % 3 === 0 ? formatEs(w.start, 'd MMM') : ''))}
            />
          </Card>

          <SectionHeader title="Calendario de actividad" />
          <Card>
            <ActivityGrid weeks={data.grid} today={today} />
            <View className="mt-3 flex-row items-center justify-end gap-1.5">
              <Text className="text-[10px] text-muted dark:text-muted-dark">0 %</Text>
              {[0.25, 0.45, 0.7, 1].map((a) => (
                <View key={a} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.success, opacity: a }} />
              ))}
              <Text className="text-[10px] text-muted dark:text-muted-dark">100 %</Text>
            </View>
          </Card>

          <SectionHeader title="Mayor cumplimiento" action={<ThumbsUp size={16} color={t.success} />} />
          <Card className="py-1">
            <RankingList items={data.top} empty="Aún no hay días programados en este periodo." />
          </Card>
          {data.bottom.length ? (
            <>
              <SectionHeader title="Menor cumplimiento" action={<ThumbsDown size={16} color={t.danger} />} />
              <Card className="py-1">
                <RankingList items={data.bottom} empty="" />
              </Card>
            </>
          ) : null}

          <SectionHeader title="Tiempo invertido" />
          <View className="flex-row gap-3">
            <StatTile
              icon={Dumbbell}
              color="#F97316"
              label="Entrenamiento"
              value={formatMinutes(data.training.minutes)}
              hint={data.training.habitCount ? `≈ ${formatMinutes(data.training.minutes / days)} al día` : 'Sin hábitos de ejercicio por duración'}
            />
            <StatTile
              icon={BookOpen}
              color="#3B82F6"
              label="Estudio"
              value={formatMinutes(data.study.minutes)}
              hint={data.study.habitCount ? `≈ ${formatMinutes(data.study.minutes / days)} al día` : 'Sin hábitos de estudio por duración'}
            />
          </View>

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
                  {pct(data.weekdays[d])}
                </Txt>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Agua */}
      <SectionHeader title="Hidratación" />
      <PressableScale scaleTo={0.99} onPress={() => router.push('/water')}>
        <Card className="pt-4">
          <View className="mb-4 flex-row gap-6">
            <View>
              <Txt variant="caption">Hoy</Txt>
              <Txt variant="heading">{formatWater(todayWater, waterUnit)}</Txt>
            </View>
            <View>
              <Txt variant="caption">Promedio diario</Txt>
              <Txt variant="heading">{data.waterAvg ? formatWater(data.waterAvg, waterUnit) : '–'}</Txt>
            </View>
            <View>
              <Txt variant="caption">Meta</Txt>
              <Txt variant="heading">{formatWater(waterGoalMl, waterUnit)}</Txt>
            </View>
          </View>
          <BarChart
            values={data.water.map((w) => (w.ml ? w.ml / waterMax : null))}
            color={WATER_COLOR}
            reference={waterGoalMl / waterMax}
            labels={days === 7 ? data.water.map((w) => WEEKDAY_SHORT[weekdayOf(w.date)]) : undefined}
          />
        </Card>
      </PressableScale>

      {/* Sueño */}
      <SectionHeader title="Sueño" />
      <PressableScale scaleTo={0.98} onPress={() => router.push('/sleep')}>
        <Card className="flex-row items-center gap-4">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sleep/15">
            <Moon size={22} color={t.sleep} />
          </View>
          <View className="flex-1">
            {data.sleep.nights ? (
              <>
                <Txt variant="heading">{formatDurationShort(data.sleep.avgMinutes)} de promedio</Txt>
                <Txt variant="caption" className="mt-0.5">
                  {data.sleep.nights} {data.sleep.nights === 1 ? 'noche' : 'noches'} · meta {formatDurationShort(sleepGoalMinutes)} cumplida el {pct(data.sleep.goalHitRate)}
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
