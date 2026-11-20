import { memo, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Bell, Check, Flame, Plus } from 'lucide-react-native';
import type { Habit } from '@/domain/types';
import { describeFrequency } from '@/domain/habits';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { ProgressRing } from '@/components/ui/progress';
import { IconBadge, PressableScale, Txt, cx } from '@/components/ui/primitives';
import { habitIcon } from './habitIcons';

/** Botón circular de completar. Con meta >1 muestra un anillo con el conteo. */
function CheckButton({ habit, count, onPress }: { habit: Habit; count: number; onPress: () => void }) {
  const t = useTheme();
  const done = count >= habit.targetPerDay;
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

  const multi = habit.targetPerDay > 1;

  return (
    <PressableScale
      scaleTo={0.85}
      hitSlop={10}
      onPress={() => {
        scale.set(withSequence(withTiming(0.88, { duration: 70 }), withSpring(1)));
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={done ? `Desmarcar ${habit.name}` : `Completar ${habit.name}`}
    >
      <Animated.View style={wrapStyle}>
        {multi && !done ? (
          <ProgressRing progress={count / habit.targetPerDay} size={44} stroke={4} color={habit.color}>
            {count === 0 ? (
              <Plus size={18} color={habit.color} strokeWidth={2.6} />
            ) : (
              <Text style={{ color: habit.color }} className="text-[13px] font-bold">
                {count}
              </Text>
            )}
          </ProgressRing>
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-full border-2" style={{ borderColor: done ? habit.color : t.line }}>
            <Animated.View
              style={[{ backgroundColor: habit.color }, fillStyle]}
              className="absolute h-11 w-11 items-center justify-center rounded-full"
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
  count,
  streak,
  onToggle,
  showFrequency = false,
}: {
  habit: Habit;
  count: number;
  streak: number;
  onToggle?: () => void;
  showFrequency?: boolean;
}) {
  const t = useTheme();
  const Icon = habitIcon(habit.icon);
  const done = count >= habit.targetPerDay;

  const subtitle = showFrequency
    ? describeFrequency(habit)
    : habit.targetPerDay > 1
      ? `${count} / ${habit.targetPerDay}${habit.unit ? ` ${habit.unit}` : ''}`
      : done
        ? 'Completado'
        : (habit.description ?? 'Pendiente');

  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => router.push(`/habit/${habit.id}`)}
      accessibilityLabel={`Ver ${habit.name}`}
      className="mb-3 flex-row items-center gap-3.5 rounded-3xl border border-line bg-card p-3.5 dark:border-line-dark dark:bg-card-dark"
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
          {showFrequency && habit.reminderEnabled && habit.reminderTime ? (
            <View className="flex-row items-center gap-0.5">
              <Bell size={11} color={t.muted} />
              <Txt variant="caption" className="text-[11px]">
                {habit.reminderTime}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>
      {onToggle ? (
        <CheckButton
          habit={habit}
          count={count}
          onPress={() => {
            const willComplete = habit.targetPerDay <= 1 ? !done : !done && count + 1 >= habit.targetPerDay;
            if (willComplete) haptics.success();
            else haptics.light();
            onToggle();
          }}
        />
      ) : null}
    </PressableScale>
  );
});
