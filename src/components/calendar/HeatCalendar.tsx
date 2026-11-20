import { memo, useCallback, useMemo } from 'react';
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

type DayInfo = { ratio: number | null };

/**
 * Calendario mensual con mapa de calor.
 * `getDay` devuelve el cumplimiento (0…1) o null si no había nada programado.
 */
export const HeatCalendar = memo(function HeatCalendar({
  today,
  selected,
  onSelect,
  getDay,
  color,
  firstDay,
  onMonthChange,
}: {
  today: DateKey;
  selected?: DateKey;
  onSelect?: (d: DateKey) => void;
  getDay: (d: DateKey) => DayInfo;
  color?: string;
  firstDay: 0 | 1;
  onMonthChange?: (month: DateKey) => void;
}) {
  const t = useTheme();
  const accent = color ?? t.brand;
  const theme = useMemo(() => calendarTheme(t), [t.scheme]); // eslint-disable-line react-hooks/exhaustive-deps

  const DayCell = useCallback(
    ({ date, state }: { date?: DateData; state?: string }) => {
      if (!date) return <View style={{ width: 40, height: 44 }} />;
      const key = date.dateString;
      const future = key > today;
      const outside = state === 'disabled';
      const { ratio } = getDay(key);
      const isSel = key === selected;
      const isToday = key === today;
      const full = ratio !== null && ratio >= 1;
      const bg = ratio === null || ratio === 0 || future ? 'transparent' : full ? accent : withAlpha(accent, 0.18 + ratio * 0.45);

      return (
        <PressableScale
          scaleTo={0.88}
          disabled={!onSelect}
          onPress={() => {
            haptics.selection();
            onSelect?.(key);
          }}
          accessibilityLabel={key}
          className="items-center"
          style={{ width: 40, height: 44, opacity: outside ? 0.35 : 1 }}
        >
          <View
            className={cx('h-9 w-9 items-center justify-center rounded-xl')}
            style={{
              backgroundColor: bg,
              borderWidth: isSel ? 2 : isToday ? 1.5 : 0,
              borderColor: isSel ? t.ink : accent,
            }}
          >
            <Text
              style={{ color: full ? '#FFFFFF' : future ? t.muted : t.ink }}
              className={cx('text-[14px]', isToday || isSel ? 'font-bold' : 'font-medium')}
            >
              {date.day}
            </Text>
          </View>
          {ratio !== null && ratio === 0 && !future && !outside ? (
            <View className="mt-0.5 h-1 w-1 rounded-full" style={{ backgroundColor: t.line }} />
          ) : null}
        </PressableScale>
      );
    },
    [today, selected, getDay, accent, onSelect, t],
  );

  return (
    <Calendar
      key={t.scheme}
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

export function HeatLegend({ color }: { color?: string }) {
  const t = useTheme();
  const accent = color ?? t.brand;
  return (
    <View className="mt-2 flex-row items-center justify-center gap-1.5">
      <Text className="mr-1 text-[11px] text-muted dark:text-muted-dark">Menos</Text>
      {[0.18, 0.4, 0.63, 1].map((a, i) => (
        <View key={i} className="h-3.5 w-3.5 rounded" style={{ backgroundColor: a === 1 ? accent : withAlpha(accent, a) }} />
      ))}
      <Text className="ml-1 text-[11px] text-muted dark:text-muted-dark">Más</Text>
    </View>
  );
}
