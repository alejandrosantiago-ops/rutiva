import { Redirect, useLocalSearchParams } from 'expo-router';
import { HabitForm } from '@/components/habits/HabitForm';
import { useHabitStore } from '@/stores/useHabitStore';

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const updateHabit = useHabitStore((s) => s.updateHabit);

  if (!habit) return <Redirect href="/habits" />;

  return (
    <HabitForm
      title="Editar hábito"
      submitLabel="Guardar cambios"
      initial={{
        name: habit.name,
        description: habit.description,
        icon: habit.icon,
        color: habit.color,
        frequency: habit.frequency,
        daysOfWeek: habit.daysOfWeek,
        targetPerDay: habit.targetPerDay,
        unit: habit.unit,
        reminderEnabled: habit.reminderEnabled,
        reminderTime: habit.reminderTime ?? '09:00',
      }}
      onSubmit={async (input) => {
        await updateHabit(habit.id, input);
      }}
    />
  );
}
