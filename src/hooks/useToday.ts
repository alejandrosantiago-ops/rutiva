import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayKey } from '@/domain/dates';

/** Fecha local de hoy; se actualiza al cruzar la medianoche o al volver a la app. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const refresh = () => setToday((prev) => (prev === todayKey() ? prev : todayKey()));
    const id = setInterval(refresh, 30_000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return today;
}

/**
 * Día seleccionado que vuelve a "hoy" cuando cambia la fecha con la app abierta.
 * Ajusta el estado durante el render (patrón recomendado por React) en lugar de en un efecto.
 */
export function useSelectedDay(today: string) {
  const [selected, setSelected] = useState(today);
  const [prevToday, setPrevToday] = useState(today);
  if (prevToday !== today) {
    setPrevToday(today);
    setSelected(today);
  }
  return [selected, setSelected] as const;
}
