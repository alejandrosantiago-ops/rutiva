import { memo, useCallback, useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import type { DateKey } from '@/domain/types';
import { useTheme, withAlpha, type ThemeColors } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { PressableScale, cx } from '@/components/ui/primitives';

function calendarTheme(t: ThemeColors) {
  return {
    calendarBackground: 'transparent',
    textSectionTitleColor: t.muted,
    monthTextColor: t.ink,
    textMonthFontWeight: '700' as const,
    textMonthFontSize: 17,
    textDayHeaderFontWeight: '600' as const,
    textDayHeaderFontSize: 12,
    arrowColor: t.brand,
    dayTextColor: t.ink,
    textDisabledColor: t.muted,
    todayTextColor: t.brand,
  };
}

/**
 * Estado de un día:
 * - ratio null → no tocaba nada (antes del inicio, día no programado…).
 * - paused → el hábito estaba en pausa.
 * - 0 / parcial / 1 → sin cumplir / parcial / completo.
 */
export type DayInfo = { ratio: number | null; paused?: boolean };

const CELL_W = 42;
const CELL_H = 50;

/** Calendario mensual con indicadores de cumplimiento. */
export const HeatCalendar = memo(function HeatCalendar({
  today,
  selected,
  onSelect,
  getDay,
  color,
  firstDay,
  onMonthChange,
  showPercent = true,
}: {
  today: DateKey;
  selected?: DateKey;
  onSelect?: (d: DateKey) => void;
  getDay: (d: DateKey) => DayInfo;
  color?: string;
  firstDay: 0 | 1;
  onMonthChange?: (month: DateKey) => void;
  showPercent?: boolean;
}) {
  const t = useTheme();
  const accent = color ?? t.brand;
  const theme = useMemo(() => calendarTheme(t), [t]);

  const DayCell = useCallback(
    ({ date, state }: { date?: DateData; state?: string }) => {
      if (!date) return <View style={{ width: CELL_W, height: CELL_H }} />;
      const key = date.dateString;
      const future = key > today;
      const outside = state === 'disabled';
      const { ratio, paused } = future ? { ratio: null } : getDay(key);
      const isSel = key === selected;
      const isToday = key === today;
      const full = ratio !== null && ratio >= 1;
      const partial = ratio !== null && ratio > 0 && ratio < 1;
      const missed = ratio === 0;
      const bg = full ? accent : partial ? withAlpha(accent, 0.15 + ratio * 0.35) : 'transparent';
      const label = full ? 'completo' : partial ? `${Math.round(ratio * 100)} %` : missed ? 'sin cumplir' : paused ? 'en pausa' : 'sin hábitos';

      return (
        <PressableScale
          scaleTo={0.88}
          disabled={!onSelect}
          onPress={() => {
            haptics.selection();
            onSelect?.(key);
          }}
          accessibilityLabel={`${key}: ${label}`}
          className="items-center"
          style={{ width: CELL_W, height: CELL_H, opacity: outside ? 0.35 : 1 }}
        >
          <View
            className="h-9 w-9 items-center justify-center rounded-xl"
            style={{
              backgroundColor: bg,
              borderWidth: isSel ? 2 : isToday ? 1.5 : 0,
              borderColor: isSel ? t.ink : accent,
            }}
          >
            <Text
              style={{ color: full ? '#FFFFFF' : future || paused ? t.muted : t.ink }}
              className={cx('text-[14px]', isToday || isSel ? 'font-bold' : 'font-medium')}
            >
              {date.day}
            </Text>
          </View>
          {/* Indicador discreto bajo el número */}
          {!outside && partial && showPercent ? (
            <Text style={{ color: t.muted }} className="mt-0.5 text-[9px] font-semibold">
              {Math.round(ratio * 100)}
            </Text>
          ) : !outside && missed ? (
            <View className="mt-1 h-1 w-1 rounded-full" style={{ backgroundColor: t.danger, opacity: 0.7 }} />
          ) : !outside && paused ? (
            <View className="mt-1 h-0.5 w-2.5 rounded-full" style={{ backgroundColor: t.muted }} />
          ) : null}
        </PressableScale>
      );
    },
    [today, selected, getDay, accent, onSelect, t, showPercent],
  );

  return (
    <Calendar
      // Se remonta al cambiar de tema o de mes seleccionado (p. ej. al pulsar «Hoy»).
      key={`${t.scheme}-${(selected ?? today).slice(0, 7)}`}
      current={selected ?? today}
      firstDay={firstDay}
      enableSwipeMonths
      hideExtraDays={false}
      theme={theme}
      dayComponent={DayCell}
      onMonthChange={(m: DateData) => onMonthChange?.(m.dateString)}
      style={{ paddingHorizontal: 0 }}
    />
  );
});

export function HeatLegend({ color, showPaused = false }: { color?: string; showPaused?: boolean }) {
  const t = useTheme();
  const accent = color ?? t.brand;
  const item = (swatch: ReactNode, label: string) => (
    <View className="flex-row items-center gap-1.5">
      {swatch}
      <Text className="text-[11px] text-muted dark:text-muted-dark">{label}</Text>
    </View>
  );
  return (
    <View className="mt-2 flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {item(<View className="h-3.5 w-3.5 rounded" style={{ backgroundColor: accent }} />, 'Completo')}
      {item(<View className="h-3.5 w-3.5 rounded" style={{ backgroundColor: withAlpha(accent, 0.35) }} />, 'Parcial (%)')}
      {item(<View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.danger }} />, 'Sin cumplir')}
      {showPaused ? item(<View className="h-0.5 w-3 rounded-full" style={{ backgroundColor: t.muted }} />, 'En pausa') : null}
    </View>
  );
}
