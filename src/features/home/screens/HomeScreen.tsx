import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { Activity, ChevronRight, Clock, Droplets, Flame, Moon, Plus, Settings, Timer } from 'lucide-react-native';
import { formatDurationShort, formatEs, greeting } from '@/domain/dates';
import {
  dayProgress,
  describeProgress,
  formatMinutes,
  getValue,
  habitsForDay,
  isDoneOn,
  nextHabit,
  perfectDayStreak,
  progressRatio,
} from '@/domain/habits';
import { formatWater } from '@/domain/water';
import type { DateKey, Habit, LogIndex } from '@/domain/types';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useWaterStore } from '@/features/water/store/useWaterStore';
import { useTimerStore } from '@/features/habits/store/timer';
import { toast } from '@/ui/toast';
import { useLogIndex, useWaterTotals } from '@/features/habits/hooks/useLogIndex';
import { useSelectedDay, useToday } from '@/hooks/useToday';
import { useTheme, WATER_COLOR } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { showError } from '@/lib/dialogs';
import { Screen } from '@/ui/layout';
import { Fab } from '@/ui/fab';
import { Card, IconBadge, IconButton, PressableScale, SectionHeader, Txt } from '@/ui/primitives';
import { ProgressBar, ProgressRing } from '@/ui/progress';
import { WeekStrip } from '@/features/habits/components/WeekStrip';
import { DayHabitList } from '@/features/habits/components/DayHabitList';
import { habitIcon } from '@/features/habits/components/habitIcons';
import { logRoute } from '@/features/habits/components/HabitCard';

function motivation(ratio: number, scheduled: number): string {
  if (scheduled === 0) return 'Hoy no tienes hábitos programados.';
  if (ratio >= 1) return '¡Día completado! Excelente trabajo.';
  if (ratio >= 0.75) return 'Ya casi lo tienes, un último empujón.';
  if (ratio >= 0.4) return 'Vas por buen camino, sigue así.';
  if (ratio > 0) return 'Buen comienzo. Paso a paso.';
  return 'Cada gran cambio empieza con un primer paso.';
}

/** Minutos de ejercicio y hábitos de ejercicio cumplidos en un día. */
function activitySummary(habits: Habit[], logs: LogIndex, date: DateKey) {
  const exercise = habitsForDay(habits, date).filter((h) => h.category === 'exercise');
  const timed = exercise.filter((h) => h.trackingType === 'duration');
  return {
    total: exercise.length,
    done: exercise.filter((h) => isDoneOn(h, logs, date)).length,
    minutes: timed.reduce((a, h) => a + getValue(logs, h.id, date), 0),
    targetMinutes: timed.reduce((a, h) => a + h.target, 0),
    ratio: exercise.length ? exercise.reduce((a, h) => a + progressRatio(h, getValue(logs, h.id, date)), 0) / exercise.length : 0,
  };
}

/** Tarjeta compacta de resumen (agua, actividad, sueño). */
function SummaryTile({
  icon: Icon,
  color,
  label,
  value,
  hint,
  progress,
  onPress,
  action,
}: {
  icon: typeof Moon;
  color: string;
  label: string;
  value: string;
  hint: string;
  progress: number;
  onPress: () => void;
  action?: ReactNode;
}) {
  return (
    <PressableScale scaleTo={0.97} onPress={onPress} className="flex-1" accessibilityLabel={`${label}: ${value}`}>
      <Card className="flex-1 p-3.5">
        <View className="flex-row items-center justify-between">
          <View className="h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22` }}>
            <Icon size={16} color={color} strokeWidth={2.4} />
          </View>
          {action}
        </View>
        <Txt variant="caption" className="mt-2.5">
          {label}
        </Txt>
        <Txt variant="heading" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Txt>
        <Txt variant="caption" numberOfLines={1} className="text-[11px]">
          {hint}
        </Txt>
        <ProgressBar className="mt-2" height={5} color={color} progress={progress} />
      </Card>
    </PressableScale>
  );
}

export default function HomeScreen() {
  const t = useTheme();
  const today = useToday();
  const [selected, setSelected] = useSelectedDay(today);
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const settings = useSettingsStore((s) => s.settings);
  const sleepLogs = useSleepStore((s) => s.logs);
  const waterTotals = useWaterTotals();
  const addWater = useWaterStore((s) => s.add);
  const activeTimer = useTimerStore((s) => s.session);

  const progress = useMemo(() => dayProgress(habits, logs, selected), [habits, logs, selected]);

  // Celebración discreta al completar todos los hábitos de hoy.
  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const wasComplete = useRef<boolean | null>(null);
  const todayDone = selected === today && progress.scheduled > 0 && progress.completed === progress.scheduled;
  useEffect(() => {
    if (wasComplete.current === false && todayDone) {
      haptics.success();
      pulse.set(withSequence(withSpring(1.04, { damping: 6, stiffness: 300 }), withSpring(1, { damping: 12 })));
      toast('¡Día completado! Todos tus hábitos están hechos.');
    }
    wasComplete.current = todayDone;
  }, [todayDone, pulse]);
  const streak = useMemo(() => perfectDayStreak(habits, logs, today), [habits, logs, today]);
  const activity = useMemo(() => activitySummary(habits, logs, selected), [habits, logs, selected]);
  const now = new Date();
  const upcoming = selected === today ? nextHabit(habits, logs, today, now.getHours() * 60 + now.getMinutes()) : null;
  const sleep = sleepLogs.find((l) => l.date === selected);
  const water = waterTotals[selected] ?? 0;
  const isToday = selected === today;
  const name = settings.userName.trim();

  return (
    <Screen
      subtitle={formatEs(today, "EEEE, d 'de' MMMM")}
      title={name ? `${greeting()}, ${name}` : greeting()}
      right={<IconButton icon={Settings} label="Configuración" onPress={() => router.push('/settings')} />}
      fab={<Fab icon={Plus} label="Nuevo hábito" onPress={() => router.push('/habit/new')} />}
    >
      {/* Progreso del día */}
      <Animated.View entering={FadeIn.duration(400)} style={pulseStyle}>
        <View className="mt-4 rounded-4xl bg-brand-500 p-5 dark:bg-brand-600">
          <View className="flex-row items-center gap-5">
            <ProgressRing progress={progress.ratio} size={104} stroke={11} color="#FFFFFF" trackColor="rgba(255,255,255,0.22)">
              <Text className="text-[26px] font-bold text-white">{Math.round(progress.ratio * 100)}%</Text>
            </ProgressRing>
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-white/70">
                {isToday ? 'Progreso diario' : formatEs(selected, "EEEE d 'de' MMM")}
              </Text>
              <Text className="mt-1 text-[22px] font-bold text-white">
                {progress.completed} de {progress.scheduled} hábitos
              </Text>
              <Text className="mt-1 text-[14px] leading-5 text-white/80">{motivation(progress.ratio, progress.scheduled)}</Text>
            </View>
          </View>
          <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-white/15 px-3 py-2">
            <Flame size={16} color="#FFFFFF" />
            <Text className="flex-1 text-[13px] font-semibold text-white">
              {streak > 0
                ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'} cumpliendo todos tus objetivos`
                : 'Completa todos tus hábitos hoy para empezar una racha'}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Próximo hábito */}
      {upcoming ? (
        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
          <PressableScale
            scaleTo={0.98}
            onPress={() =>
              upcoming.trackingType === 'quantity' || upcoming.trackingType === 'duration'
                ? router.push(logRoute(upcoming, today))
                : router.push(`/habit/${upcoming.id}`)
            }
          >
            <Card className="mt-4 flex-row items-center gap-3.5">
              <IconBadge icon={habitIcon(upcoming.icon)} color={upcoming.color} size={44} />
              <View className="flex-1">
                <Txt variant="overline">Próximo hábito</Txt>
                <Txt variant="heading" numberOfLines={1} className="mt-0.5">
                  {upcoming.name}
                </Txt>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  {upcoming.suggestedTime || upcoming.reminderTimes.length ? (
                    <>
                      <Clock size={12} color={t.muted} />
                      <Txt variant="caption">{upcoming.suggestedTime ?? [...upcoming.reminderTimes].sort()[0]}</Txt>
                      <Txt variant="caption">·</Txt>
                    </>
                  ) : null}
                  <Txt variant="caption">{describeProgress(upcoming, getValue(logs, upcoming.id, today))}</Txt>
                </View>
              </View>
              <ChevronRight size={18} color={t.muted} />
            </Card>
          </PressableScale>
        </Animated.View>
      ) : null}

      {/* Resúmenes */}
      <View className="mt-4 flex-row gap-3">
        <SummaryTile
          icon={Droplets}
          color={WATER_COLOR}
          label="Agua"
          value={`${formatWater(water, settings.waterUnit)}`}
          hint={`de ${formatWater(settings.waterGoalMl, settings.waterUnit)}`}
          progress={water / settings.waterGoalMl}
          onPress={() => router.push({ pathname: '/water', params: { date: selected } })}
          action={
            <PressableScale
              haptic
              hitSlop={8}
              accessibilityLabel="Añadir 250 ml de agua"
              onPress={() => {
                if (water < settings.waterGoalMl && water + 250 >= settings.waterGoalMl) haptics.success();
                addWater(selected, 250)
                  .then((log) => log && toast('+250 ml de agua', { undo: () => useWaterStore.getState().remove(log.id) }))
                  .catch((e) => showError('No se pudo guardar', e));
              }}
              className="h-8 flex-row items-center rounded-full px-2"
              style={{ backgroundColor: `${WATER_COLOR}22` }}
            >
              <Plus size={14} color={WATER_COLOR} strokeWidth={2.8} />
              <Text style={{ color: WATER_COLOR }} className="text-[11px] font-bold">
                250
              </Text>
            </PressableScale>
          }
        />
        <SummaryTile
          icon={Activity}
          color="#F97316"
          label="Actividad"
          value={
            activity.targetMinutes > 0
              ? `${Math.round(activity.minutes)} min`
              : activity.total > 0
                ? `${activity.done} de ${activity.total}`
                : '—'
          }
          hint={
            activity.targetMinutes > 0
              ? `de ${formatMinutes(activity.targetMinutes)}`
              : activity.total > 0
                ? 'hábitos de ejercicio'
                : 'Sin ejercicio hoy'
          }
          progress={activity.ratio}
          onPress={() => router.push('/habits')}
        />
        <SummaryTile
          icon={Moon}
          color={t.sleep}
          label="Sueño"
          value={sleep ? formatDurationShort(sleep.durationMinutes) : '—'}
          hint={sleep ? `de ${formatDurationShort(settings.sleepGoalMinutes)}` : 'Sin registrar'}
          progress={sleep ? sleep.durationMinutes / settings.sleepGoalMinutes : 0}
          onPress={() => router.push(sleep ? '/sleep' : '/sleep/new')}
        />
      </View>

      <View className="mt-4">
        <WeekStrip habits={habits} logs={logs} today={today} selected={selected} onSelect={setSelected} weekStartsOn={settings.weekStartsOn} />
      </View>

      <SectionHeader
        title={isToday ? 'Hábitos de hoy' : formatEs(selected, "EEEE d 'de' MMMM")}
        action={
          isToday ? undefined : (
            <PressableScale onPress={() => setSelected(today)}>
              <Text className="text-[13px] font-semibold text-brand-500 dark:text-brand-300">Volver a hoy</Text>
            </PressableScale>
          )
        }
      />
      <DayHabitList date={selected} today={today} />
      {activeTimer?.habitId ? (
        <PressableScale
          onPress={() => router.push({ pathname: '/habit/log/[id]', params: { id: activeTimer.habitId!, date: activeTimer.date ?? today } })}
        >
          <View className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl bg-success/10 py-3">
            <Timer size={16} color={t.success} />
            <Text className="text-[13px] font-semibold text-success">Hay un cronómetro en marcha · tocar para verlo</Text>
          </View>
        </PressableScale>
      ) : null}
    </Screen>
  );
}
