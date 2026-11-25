import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Archive, ArrowUpDown, Check, ListChecks, Plus } from 'lucide-react-native';
import { ReorderList } from '@/features/habits/components/ReorderList';
import { showError } from '@/lib/dialogs';
import { currentStreak, getValue } from '@/domain/habits';
import { useLogIndex } from '@/features/habits/hooks/useLogIndex';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useToday } from '@/hooks/useToday';
import { Screen } from '@/ui/layout';
import { Fab } from '@/ui/fab';
import { Button, EmptyState, Txt } from '@/ui/primitives';
import { Segmented } from '@/ui/form';
import { HabitCard } from '@/features/habits/components/HabitCard';

type Filter = 'active' | 'archived';

export default function HabitsScreen() {
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const [filter, setFilter] = useState<Filter>('active');
  const [ordering, setOrdering] = useState(false);
  const reorder = useHabitStore((s) => s.reorder);

  const list = useMemo(() => habits.filter((h) => (filter === 'active' ? !h.archived : h.archived)), [habits, filter]);
  const activeCount = habits.filter((h) => !h.archived).length;

  return (
    <Screen
      subtitle={`${activeCount} ${activeCount === 1 ? 'hábito activo' : 'hábitos activos'}`}
      title="Hábitos"
      right={
        filter === 'active' && list.length > 1 ? (
          <Button
            size="sm"
            variant={ordering ? 'primary' : 'secondary'}
            icon={ordering ? Check : ArrowUpDown}
            title={ordering ? 'Listo' : 'Ordenar'}
            onPress={() => setOrdering((o) => !o)}
          />
        ) : undefined
      }
      fab={ordering ? undefined : <Fab icon={Plus} label="Nuevo hábito" onPress={() => router.push('/habit/new')} />}
    >
      <View className="mb-5 mt-4">
        <Segmented<Filter>
          value={filter}
          onChange={(v) => {
            setOrdering(false);
            setFilter(v);
          }}
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
      ) : ordering && filter === 'active' ? (
        <ReorderList
          habits={list}
          onReorder={(ids) => reorder(ids).catch((e) => showError('No se pudo guardar el orden', e))}
        />
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
