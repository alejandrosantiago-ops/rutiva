import { ScrollView, Text, View } from 'react-native';
import { formatEs, WEEKDAY_SHORT, weekdayOf } from '@/domain/dates';
import type { DateKey } from '@/domain/types';
import { useTheme, withAlpha } from '@/theme/colors';

const CELL = 13;
const GAP = 3;

/** Calendario de actividad: una columna por semana, intensidad = cumplimiento. */
export function ActivityGrid({ weeks, today }: { weeks: { date: DateKey; ratio: number | null }[][]; today: DateKey }) {
  const t = useTheme();
  const firstColumn = weeks[0] ?? [];
  const color = (r: number | null) =>
    r === null ? t.subtle : r >= 1 ? t.success : r >= 0.66 ? withAlpha(t.success, 0.7) : r >= 0.33 ? withAlpha(t.success, 0.45) : r > 0 ? withAlpha(t.success, 0.25) : withAlpha(t.danger, 0.22);

  return (
    <View className="flex-row">
      {/* Etiquetas de día (alternas para no saturar) */}
      <View style={{ marginTop: 16, marginRight: 6 }}>
        {firstColumn.map((c, i) => (
          <Text key={c.date} style={{ height: CELL, marginBottom: GAP, fontSize: 9, lineHeight: CELL }} className="text-muted dark:text-muted-dark">
            {i % 2 === 0 ? WEEKDAY_SHORT[weekdayOf(c.date)] : ''}
          </Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
        <View>
          {/* Meses */}
          <View className="flex-row" style={{ height: 16 }}>
            {weeks.map((col, i) => {
              const first = col[0].date;
              const showMonth = i === 0 || first.slice(5, 7) !== weeks[i - 1][0].date.slice(5, 7);
              return (
                <Text key={first} style={{ width: CELL + GAP, fontSize: 9 }} className="text-muted dark:text-muted-dark" numberOfLines={1}>
                  {showMonth ? formatEs(first, 'MMM') : ''}
                </Text>
              );
            })}
          </View>
          <View className="flex-row">
            {weeks.map((col) => (
              <View key={col[0].date} style={{ marginRight: GAP }}>
                {col.map((c) => (
                  <View
                    key={c.date}
                    accessibilityLabel={`${c.date}: ${c.ratio === null ? 'sin hábitos' : `${Math.round(c.ratio * 100)} %`}`}
                    style={{
                      width: CELL,
                      height: CELL,
                      marginBottom: GAP,
                      borderRadius: 3,
                      backgroundColor: c.date > today ? 'transparent' : color(c.ratio),
                      borderWidth: c.date === today ? 1.5 : 0,
                      borderColor: t.ink,
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
