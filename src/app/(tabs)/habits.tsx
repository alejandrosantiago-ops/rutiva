import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Archive, ListChecks, Plus } from 'lucide-react-native';
import { currentStreak, getValue } from '@/domain/habits';
import { useLogIndex } from '@/hooks/useLogIndex';
import { useHabitStore } from '@/stores/useHabitStore';
import { useToday } from '@/hooks/useToday';
import { Screen } from '@/components/ui/layout';
import { Button, EmptyState, IconButton, Txt } from '@/components/ui/primitives';
import { Segmented } from '@/components/ui/form';
import { HabitCard } from '@/components/habits/HabitCard';

type Filter = 'active' | 'archived';

export default function HabitsScreen() {
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const [filter, setFilter] = useState<Filter>('active');

  const list = useMemo(() => habits.filter((h) => (filter === 'active' ? !h.archived : h.archived)), [habits, filter]);
  const activeCount = habits.filter((h) => !h.archived).length;

  return (
    <Screen
      subtitle={`${activeCount} ${activeCount === 1 ? 'hábito activo' : 'hábitos activos'}`}
      title="Hábitos"
      right={<IconButton icon={Plus} tone="brand" label="Nuevo hábito" onPress={() => router.push('/habit/new')} />}
    >
      <View className="mb-5 mt-4">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'Activos' },
            { value: 'archived', label: 'Archivados' },
          ]}
        />
      </View>

      {list.length === 0 ? (
        filter === 'active' ? (
          <EmptyState
            icon={ListChecks}
            title="Aún no tienes hábitos"
            description="Define pequeñas acciones diarias: beber agua, leer 10 páginas, meditar 5 minutos…"
            action={<Button title="Crear mi primer hábito" icon={Plus} onPress={() => router.push('/habit/new')} />}
          />
        ) : (
          <EmptyState icon={Archive} title="Nada archivado" description="Los hábitos que archives aparecerán aquí sin perder su historial." />
        )
      ) : (
        <>
          {list.map((h, i) => (
            <Animated.View key={h.id} entering={FadeInDown.delay(i * 40).springify().damping(18)} layout={LinearTransition}>
              <HabitCard habit={h} date={today} value={getValue(logs, h.id, today)} streak={currentStreak(h, logs, today)} showFrequency />
            </Animated.View>
          ))}
          <Txt variant="caption" className="mt-2 text-center">
            Toca un hábito para ver su historial, editarlo o archivarlo.
          </Txt>
        </>
      )}
    </Screen>
  );
}
