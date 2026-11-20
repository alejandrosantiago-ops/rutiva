import type { HabitCategory } from './types.ts';

export interface CategoryMeta {
  label: string;
  /** Clave de icono (ver components/habits/habitIcons.ts). */
  icon: string;
  color: string;
}

export const CATEGORIES: Record<HabitCategory, CategoryMeta> = {
  health: { label: 'Salud', icon: 'heart', color: '#EF4444' },
  exercise: { label: 'Ejercicio', icon: 'workout', color: '#F97316' },
  hydration: { label: 'Hidratación', icon: 'water', color: '#06B6D4' },
  study: { label: 'Estudio', icon: 'book', color: '#3B82F6' },
  work: { label: 'Trabajo', icon: 'work', color: '#64748B' },
  food: { label: 'Alimentación', icon: 'salad', color: '#84CC16' },
  sleep: { label: 'Sueño', icon: 'bed', color: '#7C6CF2' },
  productivity: { label: 'Productividad', icon: 'focus', color: '#5B5BD6' },
  wellbeing: { label: 'Bienestar', icon: 'meditate', color: '#A855F7' },
  custom: { label: 'Personalizado', icon: 'sparkles', color: '#14B8A6' },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as HabitCategory[];

/** Unidades sugeridas para hábitos de cantidad. */
export const QUANTITY_UNITS = ['L', 'ml', 'vasos', 'km', 'pasos', 'páginas', 'g', 'kcal'];
