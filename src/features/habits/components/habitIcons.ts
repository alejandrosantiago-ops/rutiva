import {
  Apple,
  Bed,
  Bike,
  BookOpen,
  Briefcase,
  Brain,
  Code,
  Coffee,
  Droplets,
  Dumbbell,
  Footprints,
  Headphones,
  Heart,
  Languages,
  Leaf,
  type LucideIcon,
  Moon,
  PenLine,
  Pill,
  Salad,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  Timer,
  Wallet,
} from 'lucide-react-native';

/** Iconos seleccionables para hábitos. La clave se guarda en la base de datos. */
export const HABIT_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  target: { icon: Target, label: 'Objetivo' },
  book: { icon: BookOpen, label: 'Leer' },
  water: { icon: Droplets, label: 'Agua' },
  workout: { icon: Dumbbell, label: 'Ejercicio' },
  walk: { icon: Footprints, label: 'Caminar' },
  bike: { icon: Bike, label: 'Bicicleta' },
  meditate: { icon: Brain, label: 'Meditar' },
  journal: { icon: PenLine, label: 'Escribir' },
  fruit: { icon: Apple, label: 'Fruta' },
  salad: { icon: Salad, label: 'Comer sano' },
  pill: { icon: Pill, label: 'Medicación' },
  heart: { icon: Heart, label: 'Salud' },
  leaf: { icon: Leaf, label: 'Naturaleza' },
  sun: { icon: Sun, label: 'Mañana' },
  moon: { icon: Moon, label: 'Noche' },
  bed: { icon: Bed, label: 'Descanso' },
  coffee: { icon: Coffee, label: 'Café' },
  music: { icon: Headphones, label: 'Música' },
  code: { icon: Code, label: 'Programar' },
  language: { icon: Languages, label: 'Idiomas' },
  money: { icon: Wallet, label: 'Finanzas' },
  work: { icon: Briefcase, label: 'Trabajo' },
  focus: { icon: Timer, label: 'Enfoque' },
  phone: { icon: Smartphone, label: 'Menos pantalla' },
  sparkles: { icon: Sparkles, label: 'Otro' },
};

export const HABIT_ICON_KEYS = Object.keys(HABIT_ICONS);

export function habitIcon(key: string): LucideIcon {
  return HABIT_ICONS[key]?.icon ?? Target;
}
