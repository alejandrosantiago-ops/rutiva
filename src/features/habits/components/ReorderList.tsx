import { useState } from 'react';
import { Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GripVertical } from 'lucide-react-native';
import type { Habit } from '@/domain/types';
import { describeFrequency } from '@/domain/habits';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { IconBadge, Txt } from '@/ui/primitives';
import { habitIcon } from './habitIcons';

/** Altura fija de cada fila (tarjeta + separación), necesaria para calcular posiciones. */
const ROW = 80;

type Positions = Record<string, number>;

function Row({
  habit,
  positions,
  count,
  onDrop,
}: {
  habit: Habit;
  positions: SharedValue<Positions>;
  count: number;
  onDrop: () => void;
}) {
  const t = useTheme();
  const top = useSharedValue((positions.value[habit.id] ?? 0) * ROW);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);

  // Si otra fila nos desplaza, nos movemos con un muelle.
  useAnimatedReaction(
    () => positions.value[habit.id],
    (index, previous) => {
      if (index !== previous && !dragging.value) top.set(withSpring(index * ROW, { damping: 20, stiffness: 220 }));
    },
  );

  const pan = usePanGesture({
    onActivate: () => {
      dragging.set(true);
      start.set(top.value);
      scheduleOnRN(haptics.light);
    },
    onUpdate: (e) => {
      top.set(Math.max(-ROW / 2, Math.min((count - 0.5) * ROW, start.value + e.translationY)));
      const target = Math.max(0, Math.min(count - 1, Math.round(top.value / ROW)));
      const current = positions.value[habit.id];
      if (target !== current) {
        // Intercambia el sitio con la fila que ocupaba la nueva posición.
        const next = { ...positions.value };
        for (const id in next) if (next[id] === target) next[id] = current;
        next[habit.id] = target;
        positions.set(next);
        scheduleOnRN(haptics.selection);
      }
    },
    onDeactivate: () => {
      top.set(withSpring(positions.value[habit.id] * ROW, { damping: 20, stiffness: 220 }));
      dragging.set(false);
      scheduleOnRN(onDrop);
    },
  });

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    top: top.value,
    zIndex: dragging.value ? 10 : 0,
    transform: [{ scale: withSpring(dragging.value ? 1.03 : 1) }],
    shadowOpacity: dragging.value ? 0.18 : 0,
    elevation: dragging.value ? 8 : 0,
  }));

  return (
    <Animated.View style={[style, { shadowColor: '#000', shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }]}>
      <View
        className="flex-row items-center gap-3.5 rounded-3xl border border-line bg-card p-3.5 dark:border-line-dark dark:bg-card-dark"
        style={{ height: ROW - 10 }}
      >
        <IconBadge icon={habitIcon(habit.icon)} color={habit.color} size={42} />
        <View className="flex-1">
          <Txt variant="heading" numberOfLines={1}>
            {habit.name}
          </Txt>
          <Txt variant="caption" numberOfLines={1}>
            {describeFrequency(habit)}
          </Txt>
        </View>
        <GestureDetector gesture={pan}>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={`Arrastrar para mover ${habit.name}`}
            className="h-12 w-12 items-center justify-center rounded-2xl border border-line bg-subtle dark:border-line-dark dark:bg-subtle-dark"
          >
            <GripVertical size={22} color={t.muted} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

/**
 * Lista para reordenar hábitos arrastrando el asa de cada tarjeta.
 * Al soltar se guarda el nuevo orden (`onReorder` con los ids ordenados).
 */
export function ReorderList({ habits, onReorder }: { habits: Habit[]; onReorder: (ids: string[]) => void }) {
  const positions = useSharedValue<Positions>(Object.fromEntries(habits.map((h, i) => [h.id, i])));
  const [items] = useState(habits);

  const commit = () => {
    const order = Object.entries(positions.value)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    onReorder(order);
  };

  return (
    <View>
      <Text className="mb-3 text-[13px] text-muted dark:text-muted-dark">Mantén pulsado el asa ⋮⋮ y arrastra para cambiar el orden.</Text>
      <View style={{ height: items.length * ROW }}>
        {items.map((h) => (
          <Row key={h.id} habit={h} positions={positions} count={items.length} onDrop={commit} />
        ))}
      </View>
    </View>
  );
}
