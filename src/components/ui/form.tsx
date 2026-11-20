import { useState, type ReactNode } from 'react';
import { Platform, Switch, Text, TextInput, type TextInputProps, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Check, ChevronRight, Clock, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { minutesToTime, timeToMinutes, WEEKDAY_SHORT } from '@/domain/dates';
import type { TimeOfDay, Weekday } from '@/domain/types';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { HABIT_ICONS, HABIT_ICON_KEYS } from '@/components/habits/habitIcons';
import { cx, PressableScale, Txt } from './primitives';

export function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <View className="mb-2 mt-6 flex-row items-baseline justify-between">
      <Txt variant="overline">{children}</Txt>
      {hint ? <Txt variant="caption">{hint}</Txt> : null}
    </View>
  );
}

export function TextField({ className, ...props }: TextInputProps & { className?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      className={cx(
        'min-h-[52px] rounded-2xl border bg-card px-4 py-3.5 text-[16px] text-ink dark:bg-card-dark dark:text-ink-dark',
        focused ? 'border-brand-400' : 'border-line dark:border-line-dark',
        className,
      )}
    />
  );
}

// ---------- Control segmentado con indicador animado ----------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width ? (width - 8) / options.length : 0;
  const indicator = useAnimatedStyle(() => ({
    width: segment,
    transform: [{ translateX: withSpring(index * segment, { damping: 22, stiffness: 260 }) }],
  }));
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="flex-row rounded-2xl bg-subtle p-1 dark:bg-subtle-dark"
    >
      {width > 0 ? (
        <Animated.View
          style={indicator}
          className="absolute bottom-1 left-1 top-1 rounded-xl bg-card shadow-sm dark:bg-elevated-dark"
        />
      ) : null}
      {options.map((o) => (
        <PressableScale
          key={o.value}
          scaleTo={0.95}
          onPress={() => {
            haptics.selection();
            onChange(o.value);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          className="h-10 flex-1 items-center justify-center"
        >
          <Text
            className={cx(
              'text-[14px] font-semibold',
              o.value === value ? 'text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark',
            )}
          >
            {o.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

// ---------- Filas de ajustes ----------

export function ListRow({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  last,
  destructive,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
}) {
  const t = useTheme();
  const content = (
    <View className={cx('min-h-[56px] flex-row items-center gap-3 py-3', !last && 'border-b border-line dark:border-line-dark')}>
      {Icon ? (
        <View
          className="h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${destructive ? t.danger : (iconColor ?? t.brand)}1F` }}
        >
          <Icon size={18} color={destructive ? t.danger : (iconColor ?? t.brand)} strokeWidth={2.2} />
        </View>
      ) : null}
      <View className="flex-1">
        <Txt variant="label" className={destructive ? 'text-danger dark:text-danger' : undefined}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" className="mt-0.5">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={t.muted} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale scaleTo={0.985} onPress={onPress} accessibilityRole="button">
      {content}
    </PressableScale>
  );
}

export function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        haptics.selection();
        onValueChange(v);
      }}
      trackColor={{ false: t.line, true: t.brand }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={t.line}
    />
  );
}

// ---------- Stepper numérico ----------

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const btn = 'h-11 w-11 items-center justify-center rounded-xl bg-subtle dark:bg-subtle-dark';
  return (
    <View className="flex-row items-center gap-3">
      <PressableScale
        accessibilityLabel="Disminuir"
        disabled={value <= min}
        onPress={() => {
          haptics.selection();
          onChange(Math.max(min, value - step));
        }}
        className={cx(btn, value <= min && 'opacity-40')}
      >
        <Minus size={18} color={t.ink} />
      </PressableScale>
      <Txt variant="heading" className="min-w-[64px] text-center">
        {format ? format(value) : String(value)}
      </Txt>
      <PressableScale
        accessibilityLabel="Aumentar"
        disabled={value >= max}
        onPress={() => {
          haptics.selection();
          onChange(Math.min(max, value + step));
        }}
        className={cx(btn, value >= max && 'opacity-40')}
      >
        <Plus size={18} color={t.ink} />
      </PressableScale>
    </View>
  );
}

// ---------- Selector de hora ----------

function timeToDate(time: TimeOfDay): Date {
  const d = new Date();
  const m = timeToMinutes(time);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}

const dateToTime = (d: Date): TimeOfDay => minutesToTime(d.getHours() * 60 + d.getMinutes());

export function TimeField({
  value,
  onChange,
  label,
  icon: Icon = Clock,
}: {
  value: TimeOfDay;
  onChange: (v: TimeOfDay) => void;
  label?: string;
  icon?: LucideIcon;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'web') {
    // Respaldo web: pasos de 5 minutos.
    const m = timeToMinutes(value);
    return (
      <View className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-4 py-2 dark:border-line-dark dark:bg-card-dark">
        <Txt variant="label">{label ?? 'Hora'}</Txt>
        <Stepper value={m} min={0} max={1435} step={5} onChange={(v) => onChange(minutesToTime(v))} format={minutesToTime} />
      </View>
    );
  }

  const openPicker = () => {
    haptics.light();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: timeToDate(value),
        mode: 'time',
        is24Hour: true,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(dateToTime(date));
        },
      });
    } else {
      setOpen((o) => !o);
    }
  };

  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-card dark:border-line-dark dark:bg-card-dark">
      <PressableScale scaleTo={0.98} onPress={openPicker} className="flex-row items-center gap-3 px-4 py-3.5">
        <Icon size={18} color={t.brand} />
        <Txt variant="label" className="flex-1">
          {label ?? 'Hora'}
        </Txt>
        <View className="rounded-xl bg-subtle px-3 py-1.5 dark:bg-subtle-dark">
          <Txt variant="heading">{value}</Txt>
        </View>
      </PressableScale>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={timeToDate(value)}
          mode="time"
          display="spinner"
          is24Hour
          locale="es-ES"
          themeVariant={t.scheme}
          onChange={(_, date) => date && onChange(dateToTime(date))}
        />
      ) : null}
    </View>
  );
}

// ---------- Selectores de hábito ----------

export function ColorPicker({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {colors.map((c) => (
        <PressableScale
          key={c}
          scaleTo={0.88}
          accessibilityLabel={`Color ${c}`}
          accessibilityState={{ selected: c === value }}
          onPress={() => {
            haptics.selection();
            onChange(c);
          }}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: c, borderWidth: c === value ? 3 : 0, borderColor: `${c}55` }}
        >
          {c === value ? <Check size={18} color="#FFFFFF" strokeWidth={3} /> : null}
        </PressableScale>
      ))}
    </View>
  );
}

export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (k: string) => void }) {
  const t = useTheme();
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {HABIT_ICON_KEYS.map((key) => {
        const { icon: Icon, label } = HABIT_ICONS[key];
        const selected = key === value;
        return (
          <PressableScale
            key={key}
            scaleTo={0.9}
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => {
              haptics.selection();
              onChange(key);
            }}
            className={cx(
              'h-12 w-12 items-center justify-center rounded-2xl border',
              selected ? '' : 'border-line bg-card dark:border-line-dark dark:bg-card-dark',
            )}
            style={selected ? { backgroundColor: `${color}22`, borderColor: color } : undefined}
          >
            <Icon size={22} color={selected ? color : t.muted} strokeWidth={2.1} />
          </PressableScale>
        );
      })}
    </View>
  );
}

export function WeekdayPicker({
  value,
  onChange,
  order,
  color,
}: {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  order: number[];
  color: string;
}) {
  return (
    <View className="flex-row justify-between">
      {order.map((d) => {
        const day = d as Weekday;
        const selected = value.includes(day);
        return (
          <PressableScale
            key={d}
            scaleTo={0.88}
            accessibilityLabel={WEEKDAY_SHORT[d]}
            accessibilityState={{ selected }}
            onPress={() => {
              haptics.selection();
              const next = selected ? value.filter((x) => x !== day) : [...value, day];
              if (next.length > 0) onChange(next.sort());
            }}
            className={cx(
              'h-11 w-11 items-center justify-center rounded-full',
              !selected && 'bg-subtle dark:bg-subtle-dark',
            )}
            style={selected ? { backgroundColor: color } : undefined}
          >
            <Text className={cx('text-[14px] font-semibold', selected ? 'text-white' : 'text-muted dark:text-muted-dark')}>
              {WEEKDAY_SHORT[d]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
