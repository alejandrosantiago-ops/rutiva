import { Text, View } from 'react-native';
import { AnimatedBar } from '@/components/ui/progress';
import { useTheme } from '@/theme/colors';

const H = 130;

/** Gráfico de barras verticales para valores 0…1. */
export function BarChart({
  values,
  labels,
  highlightLast = true,
}: {
  values: number[];
  labels?: string[];
  highlightLast?: boolean;
}) {
  const t = useTheme();
  const barWidth = values.length > 20 ? 6 : values.length > 10 ? 12 : 22;
  return (
    <View>
      <View style={{ height: H }} className="flex-row items-end justify-between">
        {/* Guías horizontales al 50 % y 100 % */}
        {[1, 0.5].map((g) => (
          <View
            key={g}
            pointerEvents="none"
            className="absolute left-0 right-0"
            style={{ bottom: g * H, borderTopWidth: 1, borderColor: t.line, borderStyle: 'dashed' }}
          />
        ))}
        {values.map((v, i) => (
          <View key={i} className="flex-1 items-center justify-end">
            <AnimatedBar
              ratio={v}
              maxHeight={H}
              width={barWidth}
              delay={i * (values.length > 20 ? 12 : 40)}
              color={v >= 1 ? t.success : highlightLast && i === values.length - 1 ? t.brand : `${t.brand}AA`}
            />
          </View>
        ))}
      </View>
      {labels ? (
        <View className="mt-2 flex-row justify-between">
          {labels.map((l, i) => (
            <Text key={i} className="flex-1 text-center text-[10px] font-semibold text-muted dark:text-muted-dark" numberOfLines={1}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
