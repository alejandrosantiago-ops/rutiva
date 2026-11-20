import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AlarmClock, BedDouble, Moon, Plus, Star, Target, Timer, TrendingUp } from 'lucide-react-native';
import { formatDurationShort, formatEs, formatIsoTime, minutesToTime, shiftKey } from '@/domain/dates';
import { logsInRange, QUALITY_LABELS, sleepSeries, summarizeSleep } from '@/domain/sleep';
import { useSleepStore } from '@/stores/useSleepStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { Screen } from '@/components/ui/layout';
import { Button, Card, EmptyState, IconButton, PressableScale, SectionHeader, StatTile, Txt } from '@/components/ui/primitives';
import { ProgressRing } from '@/components/ui/progress';
import { Segmented } from '@/components/ui/form';
import { SleepChart } from '@/components/sleep/SleepChart';

type Range = '7' | '30';

function QualityStars({ value, size = 13 }: { value: number; size?: number }) {
  const t = useTheme();
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} color={t.warning} fill={i <= value ? t.warning : 'transparent'} strokeWidth={2} />
      ))}
    </View>
  );
}

function consistencyLabel(spread: number) {
  if (spread <= 30) return 'Muy constante';
  if (spread <= 60) return 'Constante';
  if (spread <= 90) return 'Irregular';
  return 'Muy irregular';
}

export default function SleepScreen() {
  const t = useTheme();
  const today = useToday();
  const logs = useSleepStore((s) => s.logs);
  const goal = useSettingsStore((s) => s.settings.sleepGoalMinutes);
  const [range, setRange] = useState<Range>('7');
  const days = Number(range);

  const latest = logs[0] ?? null;
  const series = useMemo(() => sleepSeries(logs, today, days), [logs, today, days]);
  const summary = useMemo(
    () => summarizeSleep(logsInRange(logs, shiftKey(today, -(days - 1)), today), goal),
    [logs, today, days, goal],
  );

  return (
    <Screen
      subtitle="Descanso"
      title="Sueño"
      right={<IconButton icon={Plus} tone="brand" label="Registrar sueño" onPress={() => router.push('/sleep/new')} />}
    >
      {!latest ? (
        <EmptyState
          icon={Moon}
          title="Registra tu primera noche"
          description="Anota a qué hora te acostaste y te despertaste. Verás tu promedio, tu constancia y si cumples tu meta."
          action={<Button title="Registrar sueño" icon={Plus} onPress={() => router.push('/sleep/new')} />}
        />
      ) : (
        <>
          <Animated.View entering={FadeInDown.springify().damping(18)}>
            <PressableScale scaleTo={0.98} onPress={() => router.push({ pathname: '/sleep/new', params: { id: latest.id } })}>
              <View className="mt-4 flex-row items-center gap-5 rounded-4xl p-5" style={{ backgroundColor: t.scheme === 'dark' ? '#221D4A' : '#EEEBFF' }}>
                <ProgressRing progress={latest.durationMinutes / goal} size={100} stroke={10} color={t.sleep} trackColor={`${t.sleep}2A`}>
                  <Moon size={26} color={t.sleep} strokeWidth={2.2} />
                </ProgressRing>
                <View className="flex-1">
                  <Txt variant="overline">{latest.date === today ? 'Anoche' : formatEs(latest.date, "EEEE d 'de' MMM")}</Txt>
                  <Text className="mt-1 text-[30px] font-bold text-ink dark:text-ink-dark">{formatDurationShort(latest.durationMinutes)}</Text>
                  <Txt variant="caption" className="mt-0.5">
                    {formatIsoTime(latest.bedtimeAt)} → {formatIsoTime(latest.wakeAt)}
                  </Txt>
                  <View className="mt-2 flex-row items-center gap-2">
                    <QualityStars value={latest.quality} />
                    <Txt variant="caption">{QUALITY_LABELS[latest.quality]}</Txt>
                  </View>
                </View>
              </View>
            </PressableScale>
          </Animated.View>

          <View className="mt-5">
            <Segmented<Range>
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 días' },
                { value: '30', label: '30 días' },
              ]}
            />
          </View>

          <Card className="mt-4 pt-5">
            <SleepChart series={series} goalMinutes={goal} today={today} />
          </Card>

          <View className="mt-3 flex-row gap-3">
            <StatTile
              icon={Timer}
              color={t.sleep}
              label="Promedio"
              value={summary.nights ? formatDurationShort(summary.avgMinutes) : '–'}
              hint={`${summary.nights} ${summary.nights === 1 ? 'noche' : 'noches'}`}
            />
            <StatTile
              icon={Target}
              color={t.success}
              label="Meta cumplida"
              value={summary.nights ? `${Math.round(summary.goalHitRate * 100)}%` : '–'}
              hint={`meta ${formatDurationShort(goal)}`}
            />
          </View>
          <View className="mt-3 flex-row gap-3">
            <StatTile
              icon={BedDouble}
              color={t.brand}
              label="Te acuestas"
              value={summary.avgBedtimeOffset !== null ? minutesToTime(summary.avgBedtimeOffset) : '–'}
              hint={summary.nights > 1 ? consistencyLabel(summary.bedtimeSpread) : 'hora media'}
            />
            <StatTile
              icon={AlarmClock}
              color={t.warning}
              label="Te levantas"
              value={summary.avgWakeMinutes !== null ? minutesToTime(summary.avgWakeMinutes) : '–'}
              hint={summary.nights ? `calidad ${summary.avgQuality.toFixed(1)}/5` : 'hora media'}
            />
          </View>

          <SectionHeader title="Historial" action={<TrendingUp size={18} color={t.muted} />} />
          {logs.slice(0, 30).map((log, i) => (
            <Animated.View key={log.id} entering={FadeInDown.delay(Math.min(i, 8) * 35)}>
              <PressableScale scaleTo={0.98} onPress={() => router.push({ pathname: '/sleep/new', params: { id: log.id } })}>
                <Card className="mb-2.5 flex-row items-center gap-3.5 py-3.5">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sleep/15">
                    <Text className="text-[15px] font-bold text-sleep">{formatEs(log.date, 'd')}</Text>
                  </View>
                  <View className="flex-1">
                    <Txt variant="label">{formatEs(log.date, "EEEE d 'de' MMM")}</Txt>
                    <Txt variant="caption" className="mt-0.5">
                      {formatIsoTime(log.bedtimeAt)} → {formatIsoTime(log.wakeAt)}
                    </Txt>
                  </View>
                  <View className="items-end">
                    <Txt variant="heading" className={log.durationMinutes >= goal ? 'text-sleep dark:text-sleep' : undefined}>
                      {formatDurationShort(log.durationMinutes)}
                    </Txt>
                    <View className="mt-1">
                      <QualityStars value={log.quality} size={10} />
                    </View>
                  </View>
                </Card>
              </PressableScale>
            </Animated.View>
          ))}
        </>
      )}
    </Screen>
  );
}
