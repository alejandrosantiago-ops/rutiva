import { memo, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Bell, Check, Flame, Pause, Plus, Timer } from 'lucide-react-native';
import type { DateKey, Habit } from '@/domain/types';
import { todayKey } from '@/domain/dates';
import { describeFrequency, describeProgress, describeRemaining, describeTarget, isPaused, progressRatio } from '@/domain/habits';
import { isWaterHabit } from '@/domain/water';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { ProgressRing } from '@/ui/progress';
import { IconBadge, PressableScale, Txt, cx } from '@/ui/primitives';
import { habitIcon } from '@/features/habits/components/habitIcons';

/** Ruta del registro detallado (cantidad, duración o agua). */
export function logRoute(habit: Habit, date: DateKey) {
  if (isWaterHabit(habit)) return { pathname: '/water' as const, params: { date } };
  return { pathname: '/habit/log/[id]' as const, params: { id: habit.id, date } };
}

/** Control circular: casilla (simple), +1 (frecuencia) o "+" que abre el registro. */
function ProgressControl({ habit, value, onPress }: { habit: Habit; value: number; onPress: () => void }) {
  const t = useTheme();
  const done = value >= habit.target - 1e-6;
  const scale = useSharedValue(1);
  const fill = useSharedValue(done ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    fill.set(withTiming(done ? 1 : 0, { duration: 220 }));
    if (first.current) {
      first.current = false;
      return;
    }
    if (done) scale.set(withSequence(withSpring(1.22, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10 })));
  }, [done, fill, scale]);

  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.6 + fill.value * 0.4 }] }));
  const showRing = habit.trackingType !== 'check' && !done;

  return (
    <PressableScale
      scaleTo={0.85}
      hitSlop={10}
      onPress={() => {
        scale.set(withSequence(withTiming(0.88, { duration: 70 }), withSpring(1)));
        onPress();
      }}
      accessibilityRole={habit.trackingType === 'check' ? 'checkbox' : 'button'}
      accessibilityState={{ checked: done }}
      accessibilityLabel={
        habit.trackingType === 'check' || habit.trackingType === 'count'
          ? done
            ? `Reiniciar ${habit.name}`
            : `Registrar ${habit.name}`
          : `Añadir progreso a ${habit.name}`
      }
    >
      <Animated.View style={wrapStyle}>
        {showRing ? (
          <ProgressRing progress={progressRatio(habit, value)} size={44} stroke={4} color={habit.color}>
            {habit.trackingType === 'count' && value > 0 ? (
              <Text style={{ color: habit.color }} className="text-[13px] font-bold">
                {value}
              </Text>
            ) : (
              <Plus size={18} color={habit.color} strokeWidth={2.6} />
            )}
          </ProgressRing>
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full border-2" style={{ borderColor: done ? habit.color : t.line }}>
            <Animated.View
              style={[
                { position: 'absolute', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: habit.color },
                fillStyle,
              ]}
            >
              <Check size={22} color="#FFFFFF" strokeWidth={3} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </PressableScale>
  );
}

export const HabitCard = memo(function HabitCard({
  habit,
  value,
  streak,
  date,
  onQuick,
  showFrequency = false,
  timerRunning = false,
}: {
  habit: Habit;
  value: number;
  streak: number;
  date: DateKey;
  /** Acción rápida para hábitos simples o de frecuencia. Sin ella no hay control. */
  onQuick?: () => void;
  showFrequency?: boolean;
  timerRunning?: boolean;
}) {
  const t = useTheme();
  const Icon = habitIcon(habit.icon);
  const done = value >= habit.target - 1e-6;
  const paused = isPaused(habit);

  let subtitle: string;
  if (showFrequency) subtitle = `${describeFrequency(habit)} · ${describeTarget(habit)}`;
  else if (habit.trackingType === 'check') subtitle = done ? 'Completado' : date < todayKey() ? 'No completado' : (habit.description ?? 'Pendiente');
  else {
    const remaining = describeRemaining(habit, value);
    subtitle = remaining ? `${describeProgress(habit, value)} · ${remaining}` : describeProgress(habit, value);
  }

  const handleControl = () => {
    if (habit.trackingType === 'check' || habit.trackingType === 'count') {
      const willComplete = !done && (habit.trackingType === 'check' || value + 1 >= habit.target);
      if (willComplete) haptics.success();
      else haptics.light();
      onQuick?.();
    } else {
      haptics.light();
      router.push(logRoute(habit, date));
    }
  };

  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => router.push(`/habit/${habit.id}`)}
      accessibilityLabel={`Ver ${habit.name}`}
      className={cx(
        'mb-3 flex-row items-center gap-3.5 rounded-3xl border border-line bg-card p-3.5 dark:border-line-dark dark:bg-card-dark',
        paused && 'opacity-60',
      )}
    >
      <IconBadge icon={Icon} color={habit.color} size={46} />
      <View className="flex-1">
        <Txt variant="heading" numberOfLines={1} className={cx(done && !showFrequency && 'opacity-60')}>
          {habit.name}
        </Txt>
        <View className="mt-1 flex-row items-center gap-2">
          <Txt variant="caption" numberOfLines={1} className="shrink">
            {subtitle}
          </Txt>
          {streak > 0 ? (
            <View className="flex-row items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0.5">
              <Flame size={12} color={t.warning} strokeWidth={2.5} />
              <Text className="text-[11px] font-bold text-warning">{streak}</Text>
            </View>
          ) : null}
          {timerRunning ? (
            <View className="flex-row items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5">
              <Timer size={11} color={t.success} strokeWidth={2.5} />
              <Text className="text-[11px] font-bold text-success">En curso</Text>
            </View>
          ) : null}
          {showFrequency && paused ? (
            <View className="flex-row items-center gap-0.5 rounded-full bg-subtle px-1.5 py-0.5 dark:bg-subtle-dark">
              <Pause size={10} color={t.muted} />
              <Txt variant="caption" className="text-[11px]">
                Pausado
              </Txt>
            </View>
          ) : showFrequency && habit.reminderTimes.length ? (
            <View className="flex-row items-center gap-0.5">
              <Bell size={11} color={t.muted} />
              <Txt variant="caption" className="text-[11px]">
                {[...habit.reminderTimes].sort()[0]}
                {habit.reminderTimes.length > 1 ? ` +${habit.reminderTimes.length - 1}` : ''}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>
      {onQuick || habit.trackingType === 'quantity' || habit.trackingType === 'duration' ? (
        showFrequency ? null : <ProgressControl habit={habit} value={value} onPress={handleControl} />
      ) : null}
    </PressableScale>
  );
});
