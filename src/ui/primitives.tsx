import type { ReactNode } from 'react';
import { Pressable, type PressableProps, StyleSheet, Text, type TextProps, View, type ViewProps } from 'react-native';
import { cssInterop } from 'nativewind';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
export { cx };

// ---------- Texto ----------

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'overline';

const VARIANTS: Record<Variant, string> = {
  display: 'text-[34px] leading-[40px] font-bold tracking-tight text-ink dark:text-ink-dark',
  title: 'text-2xl font-bold tracking-tight text-ink dark:text-ink-dark',
  heading: 'text-[17px] font-semibold text-ink dark:text-ink-dark',
  body: 'text-[15px] leading-[21px] text-ink dark:text-ink-dark',
  label: 'text-sm font-medium text-ink dark:text-ink-dark',
  caption: 'text-[13px] text-muted dark:text-muted-dark',
  overline: 'text-xs font-semibold uppercase tracking-wider text-muted dark:text-muted-dark',
};

export function Txt({ variant = 'body', className, ...props }: TextProps & { variant?: Variant; className?: string }) {
  return <Text {...props} className={cx(VARIANTS[variant], className)} />;
}

// ---------- Contenedores ----------

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      {...props}
      className={cx('rounded-3xl border border-line bg-card p-4 dark:border-line-dark dark:bg-card-dark', className)}
    />
  );
}

// ---------- Pressable con micro-animación de escala ----------

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = PressableProps & { className?: string; scaleTo?: number; haptic?: boolean };

/*
 * NativeWind no convierte bien `className` en estilos cuando se registra
 * directamente un componente animado de Reanimated: en Android/iOS se perdían
 * fondos, bordes, rellenos y anchos (en web sí funcionaba). Por eso se
 * registra este componente normal: NativeWind le entrega `style` ya resuelto
 * y aquí se combina con la animación de escala.
 */
function PressableScaleBase({
  scaleTo = 0.97,
  haptic = false,
  style,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Omit<PressableScaleProps, 'className'>) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const resolved = typeof style === 'function' ? undefined : StyleSheet.flatten(style);
  return (
    <AnimatedPressable
      {...rest}
      style={[resolved, animated]}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { damping: 18, stiffness: 420 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics.light();
        onPress?.(e);
      }}
    />
  );
}

cssInterop(PressableScaleBase, { className: 'style' });

/** Pressable con micro-animación de escala y soporte completo de `className`. */
export const PressableScale = PressableScaleBase as (props: PressableScaleProps) => ReturnType<typeof PressableScaleBase>;

// ---------- Botones ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BG: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 dark:bg-brand-400',
  // Todas las variantes se ven como una tarjeta pulsable (nunca solo texto).
  secondary: 'border border-line bg-card dark:border-line-dark dark:bg-card-dark',
  ghost: 'border border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/40',
  danger: 'border border-danger/30 bg-danger/10',
};

const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-ink dark:text-ink-dark',
  ghost: 'text-brand-500 dark:text-brand-300',
  danger: 'text-danger',
};

export function Button({
  title,
  icon: Icon,
  variant = 'primary',
  disabled,
  className,
  size = 'md',
  ...props
}: PressableProps & {
  title: string;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  className?: string;
  size?: 'md' | 'sm';
}) {
  const t = useTheme();
  const iconColor = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? t.danger : variant === 'ghost' ? t.brand : t.ink;
  return (
    <PressableScale
      {...props}
      haptic
      disabled={disabled}
      accessibilityRole="button"
      className={cx(
        'flex-row items-center justify-center gap-2 rounded-2xl',
        size === 'md' ? 'h-14 px-5' : 'h-10 px-4',
        BUTTON_BG[variant],
        disabled && 'opacity-40',
        className,
      )}
    >
      {Icon ? <Icon size={size === 'md' ? 20 : 16} color={iconColor} strokeWidth={2.2} /> : null}
      <Text className={cx('font-semibold', size === 'md' ? 'text-base' : 'text-sm', BUTTON_TEXT[variant])}>{title}</Text>
    </PressableScale>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  label,
  tone = 'default',
  className,
  size = 44,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  tone?: 'default' | 'brand' | 'plain';
  className?: string;
  size?: number;
}) {
  const t = useTheme();
  const bg =
    tone === 'brand'
      ? 'bg-brand-500 dark:bg-brand-400'
      : tone === 'plain'
        ? 'bg-transparent'
        : 'bg-card border border-line dark:bg-card-dark dark:border-line-dark';
  return (
    <PressableScale
      haptic
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className={cx('items-center justify-center rounded-full', bg, className)}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.45} color={tone === 'brand' ? '#FFFFFF' : t.ink} strokeWidth={2.2} />
    </PressableScale>
  );
}

// ---------- Icono de hábito en "chip" de color ----------

export function IconBadge({ icon: Icon, color, size = 44 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: `${color}22` }}
    >
      <Icon size={size * 0.5} color={color} strokeWidth={2.2} />
    </View>
  );
}

// ---------- Cabecera de sección ----------

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View className="mb-3 mt-7 flex-row items-center justify-between">
      <Txt variant="heading">{title}</Txt>
      {action}
    </View>
  );
}

// ---------- Estado vacío ----------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View className="items-center px-6 py-10">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 dark:bg-brand-900/40">
        <Icon size={28} color={t.brand} strokeWidth={2} />
      </View>
      <Txt variant="heading" className="text-center">
        {title}
      </Txt>
      <Txt variant="caption" className="mt-1.5 text-center leading-5">
        {description}
      </Txt>
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}

// ---------- Estadística compacta ----------

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  color,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  color: string;
  className?: string;
}) {
  return (
    <Card className={cx('flex-1 p-4', className)}>
      <View className="mb-3 flex-row items-center gap-2">
        <Icon size={16} color={color} strokeWidth={2.4} />
        <Txt variant="caption" numberOfLines={1} className="flex-1">
          {label}
        </Txt>
      </View>
      <Txt variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
      {hint ? (
        <Txt variant="caption" className="mt-0.5" numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </Card>
  );
}

// ---------- Barra de acciones ----------

/**
 * Tarjeta inferior con dos acciones alineadas en la misma línea, una en cada
 * extremo (p. ej. "Atrás" a la izquierda y "Continuar" a la derecha).
 */
export function ActionBar({ left, right, className }: { left?: ReactNode; right: ReactNode; className?: string }) {
  return (
    <View
      className={cx(
        'flex-row items-center justify-between gap-3 rounded-3xl border border-line bg-card p-2.5 dark:border-line-dark dark:bg-card-dark',
        className,
      )}
    >
      <View className="min-w-0 flex-1 items-start">{left ?? null}</View>
      <View className="min-w-0 flex-1 items-end">{right}</View>
    </View>
  );
}
