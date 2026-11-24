import { Text, View } from 'react-native';
import { AnimatedBar } from '@/ui/progress';
import { useTheme } from '@/theme/colors';

const H = 130;

/**
 * Gráfico de barras verticales para valores 0…1 (`null` = sin datos).
 * - Sin `color`: barras de cumplimiento (verde al 100 %).
 * - Con `color`: barras de magnitud (agua, minutos…), opcionalmente con una línea de referencia.
 */
export function BarChart({
  values,
  labels,
  color,
  reference,
  referenceLabel,
}: {
  values: (number | null)[];
  labels?: string[];
  color?: string;
  /** Posición 0…1 de una línea discontinua (p. ej. la meta). */
  reference?: number;
  referenceLabel?: string;
}) {
  const t = useTheme();
  const barWidth = values.length > 20 ? 6 : values.length > 10 ? 12 : 22;
  const guides = reference !== undefined ? [reference] : [1, 0.5];
  const barColor = (v: number, i: number) => {
    if (color) return reference !== undefined && v >= reference ? color : `${color}99`;
    return v >= 1 ? t.success : i === values.length - 1 ? t.brand : `${t.brand}AA`;
  };

  return (
    <View>
      <View style={{ height: H }} className="flex-row items-end justify-between">
        {guides.map((g) => (
          <View
            key={g}
            pointerEvents="none"
            className="absolute left-0 right-0 flex-row items-center"
            style={{ bottom: Math.min(1, g) * H }}
          >
            <View className="flex-1" style={{ borderTopWidth: 1, borderColor: reference !== undefined ? t.muted : t.line, borderStyle: 'dashed' }} />
            {referenceLabel ? <Text className="ml-1 text-[10px] font-semibold text-muted dark:text-muted-dark">{referenceLabel}</Text> : null}
          </View>
        ))}
        {values.map((v, i) => (
          <View key={i} className="flex-1 items-center justify-end">
            {v === null ? (
              <View style={{ width: barWidth, height: 2, borderRadius: 1, backgroundColor: t.line }} />
            ) : (
              <AnimatedBar ratio={v} maxHeight={H} width={barWidth} delay={i * (values.length > 20 ? 12 : 40)} color={barColor(v, i)} />
            )}
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
