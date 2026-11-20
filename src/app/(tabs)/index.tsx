import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronRight, Moon, Plus, Settings } from 'lucide-react-native';
import { formatDurationShort, formatEs, greeting } from '@/domain/dates';
import { dayProgress } from '@/domain/habits';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSleepStore } from '@/stores/useSleepStore';
import { useSelectedDay, useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { Screen } from '@/components/ui/layout';
import { Card, IconButton, PressableScale, SectionHeader, Txt } from '@/components/ui/primitives';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { WeekStrip } from '@/components/habits/WeekStrip';
import { DayHabitList } from '@/components/habits/DayHabitList';

function motivation(ratio: number, scheduled: number): string {
  if (scheduled === 0) return 'Hoy no tienes hábitos programados.';
  if (ratio >= 1) return '¡Día completado! Excelente trabajo.';
  if (ratio >= 0.75) return 'Ya casi lo tienes, un último empujón.';
  if (ratio >= 0.4) return 'Vas por buen camino, sigue así.';
  if (ratio > 0) return 'Buen comienzo. Paso a paso.';
  return 'Cada gran cambio empieza con un primer paso.';
}

export default function HomeScreen() {
  const t = useTheme();
  const today = useToday();
  const [selected, setSelected] = useSelectedDay(today);
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const settings = useSettingsStore((s) => s.settings);
  const sleepLogs = useSleepStore((s) => s.logs);

  const progress = useMemo(() => dayProgress(habits, logs, selected), [habits, logs, selected]);
  const lastNight = sleepLogs.find((l) => l.date === today);
  const isToday = selected === today;
  const name = settings.userName.trim();

  return (
    <Screen
      subtitle={formatEs(today, "EEEE, d 'de' MMMM")}
      title={name ? `${greeting()}, ${name}` : greeting()}
      right={<IconButton icon={Settings} label="Configuración" onPress={() => router.push('/settings')} />}
    >
      {/* Tarjeta de progreso del día */}
      <Animated.View entering={FadeIn.duration(400)}>
        <View className="mt-4 flex-row items-center gap-5 rounded-4xl bg-brand-500 p-5 dark:bg-brand-600">
          <ProgressRing progress={progress.ratio} size={104} stroke={11} color="#FFFFFF" trackColor="rgba(255,255,255,0.22)">
            <Text className="text-[26px] font-bold text-white">{Math.round(progress.ratio * 100)}%</Text>
          </ProgressRing>
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase tracking-wider text-white/70">
              {isToday ? 'Progreso de hoy' : formatEs(selected, "EEEE d 'de' MMM")}
            </Text>
            <Text className="mt-1 text-[22px] font-bold text-white">
              {progress.completed} de {progress.scheduled} hábitos
            </Text>
            <Text className="mt-1 text-[14px] leading-5 text-white/80">{motivation(progress.ratio, progress.scheduled)}</Text>
          </View>
        </View>
      </Animated.View>

      <View className="mt-4">
        <WeekStrip
          habits={habits}
          logs={logs}
          today={today}
          selected={selected}
          onSelect={setSelected}
          weekStartsOn={settings.weekStartsOn}
        />
      </View>

      <SectionHeader
        title={isToday ? 'Hábitos de hoy' : formatEs(selected, "EEEE d 'de' MMMM")}
        action={
          isToday ? (
            <PressableScale haptic onPress={() => router.push('/habit/new')} className="flex-row items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 dark:bg-brand-900/50">
              <Plus size={15} color={t.brand} strokeWidth={2.6} />
              <Text className="text-[13px] font-semibold text-brand-500 dark:text-brand-300">Nuevo</Text>
            </PressableScale>
          ) : (
            <PressableScale onPress={() => setSelected(today)}>
              <Text className="text-[13px] font-semibold text-brand-500 dark:text-brand-300">Volver a hoy</Text>
            </PressableScale>
          )
        }
      />
      <DayHabitList date={selected} today={today} />

      {/* Resumen de sueño */}
      <SectionHeader title="Sueño" />
      <PressableScale scaleTo={0.98} onPress={() => router.push(lastNight ? '/sleep' : '/sleep/new')}>
        <Card className="flex-row items-center gap-4">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sleep/15">
            <Moon size={22} color={t.sleep} strokeWidth={2.2} />
          </View>
          <View className="flex-1">
            {lastNight ? (
              <>
                <Txt variant="caption">Anoche dormiste</Txt>
                <Txt variant="heading" className="mt-0.5">
                  {formatDurationShort(lastNight.durationMinutes)}
                  <Txt variant="caption"> / meta {formatDurationShort(settings.sleepGoalMinutes)}</Txt>
                </Txt>
                <ProgressBar
                  className="mt-2"
                  height={6}
                  color={t.sleep}
                  progress={lastNight.durationMinutes / settings.sleepGoalMinutes}
                />
              </>
            ) : (
              <>
                <Txt variant="heading">¿Cómo dormiste anoche?</Txt>
                <Txt variant="caption" className="mt-0.5">
                  Registra tus horas de sueño en segundos.
                </Txt>
              </>
            )}
          </View>
          <ChevronRight size={18} color={t.muted} />
        </Card>
      </PressableScale>
    </Screen>
  );
}
