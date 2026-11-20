import { useColorScheme } from 'nativewind';
import { palette } from './palette';

export { palette };

export type Scheme = 'light' | 'dark';

export interface ThemeColors {
  scheme: Scheme;
  canvas: string;
  card: string;
  elevated: string;
  line: string;
  ink: string;
  muted: string;
  subtle: string;
  brand: string;
  brandSoft: string;
  success: string;
  warning: string;
  danger: string;
  sleep: string;
}

export function themeColors(scheme: Scheme): ThemeColors {
  const base = scheme === 'dark' ? palette.dark : palette.light;
  return {
    scheme,
    ...base,
    brand: scheme === 'dark' ? palette.brand[400] : palette.brand[500],
    brandSoft: scheme === 'dark' ? '#25265A' : palette.brand[50],
    success: palette.success,
    warning: palette.warning,
    danger: palette.danger,
    sleep: palette.sleep,
  };
}

/** Colores en JS para props que no admiten className (iconos, SVG, calendario, tabs). */
export function useTheme(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return themeColors(colorScheme === 'dark' ? 'dark' : 'light');
}

/** Colores disponibles para hábitos. */
export const HABIT_COLORS = [
  '#5B5BD6',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#84CC16',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#A855F7',
  '#64748B',
  '#14B8A6',
];

/** Mezcla un color hex con transparencia (fondos suaves de iconos). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** Color del módulo de hidratación. */
export const WATER_COLOR = '#06B6D4';
