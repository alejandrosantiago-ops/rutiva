import { HabitForm, EMPTY_HABIT } from '@/components/habits/HabitForm';
import { useHabitStore } from '@/stores/useHabitStore';

export default function NewHabitScreen() {
  const createHabit = useHabitStore((s) => s.createHabit);
  return (
    <HabitForm
      title="Nuevo hábito"
      submitLabel="Crear hábito"
      initial={EMPTY_HABIT}
      onSubmit={async (input) => {
        await createHabit(input);
      }}
    />
  );
}
