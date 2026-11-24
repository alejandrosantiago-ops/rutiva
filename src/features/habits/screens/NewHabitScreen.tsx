import { useState } from 'react';
import { HabitForm, emptyHabit } from '@/features/habits/components/HabitForm';
import { useHabitStore } from '@/features/habits/store/useHabitStore';

export default function NewHabitScreen() {
  const createHabit = useHabitStore((s) => s.createHabit);
  const [initial] = useState(emptyHabit);
  return (
    <HabitForm
      isNew
      title="Nuevo hábito"
      submitLabel="Crear hábito"
      initial={initial}
      onSubmit={async (input) => {
        await createHabit(input);
      }}
    />
  );
}
