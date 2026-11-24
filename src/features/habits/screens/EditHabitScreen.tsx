import { Redirect, useLocalSearchParams } from 'expo-router';
import { HabitForm } from '@/features/habits/components/HabitForm';
import { useHabitStore } from '@/features/habits/store/useHabitStore';

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const updateHabit = useHabitStore((s) => s.updateHabit);

  if (!habit) return <Redirect href="/habits" />;

  return (
    <HabitForm
      isNew={false}
      title="Editar hábito"
      submitLabel="Guardar cambios"
      initial={{
        name: habit.name,
        description: habit.description,
        category: habit.category,
        icon: habit.icon,
        color: habit.color,
        trackingType: habit.trackingType,
        target: habit.target,
        unit: habit.unit,
        frequency: habit.frequency,
        daysOfWeek: habit.daysOfWeek,
        intervalDays: Math.max(2, habit.intervalDays),
        startDate: habit.startDate,
        endDate: habit.endDate,
        suggestedTime: habit.suggestedTime,
        reminderTimes: habit.reminderTimes,
        remindersEnabled: habit.remindersEnabled,
        reminderMessages: habit.reminderMessages,
      }}
      onSubmit={async (input) => {
        await updateHabit(habit.id, input);
      }}
    />
  );
}
