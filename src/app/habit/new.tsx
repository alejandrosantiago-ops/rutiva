import { useState } from 'react';
import { HabitForm, emptyHabit } from '@/components/habits/HabitForm';
import { useHabitStore } from '@/stores/useHabitStore';

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
