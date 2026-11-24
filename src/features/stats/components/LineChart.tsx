import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/theme/colors';

const H = 140;
const PAD_Y = 8;

/**
 * Gráfico de líneas para valores 0…1. Los `null` (días sin nada programado)
 * cortan la línea en lugar de dibujarse como 0.
 */
export function LineChart({ values, labels, color }: { values: (number | null)[]; labels?: string[]; color?: string }) {
  const t = useTheme();
  const stroke = color ?? t.brand;
  const [width, setWidth] = useState(0);
  const n = values.length;
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * (width - 8) + 4);
  const y = (v: number) => PAD_Y + (1 - Math.max(0, Math.min(1, v))) * (H - PAD_Y * 2);

  // Tramos continuos sin nulls.
  const segments: { i: number; v: number }[][] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1].i === i - 1) last.push({ i, v });
    else segments.push([{ i, v }]);
  });
  const line = (seg: { i: number; v: number }[]) => seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = (seg: { i: number; v: number }[]) =>
    `${line(seg)} L${x(seg[seg.length - 1].i).toFixed(1)},${H - PAD_Y} L${x(seg[0].i).toFixed(1)},${H - PAD_Y} Z`;
  const lastPoint = [...values].reverse().findIndex((v) => v !== null);
  const lastIndex = lastPoint === -1 ? -1 : n - 1 - lastPoint;

  return (
    <View>
      <View style={{ height: H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Animated.View entering={FadeIn.duration(500)}>
            <Svg width={width} height={H}>
              <Defs>
                <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={stroke} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              {[0, 0.5, 1].map((g) => (
                <Line key={g} x1={0} x2={width} y1={y(g)} y2={y(g)} stroke={t.line} strokeDasharray="4 4" strokeWidth={1} />
              ))}
              {segments.map((seg, k) =>
                seg.length > 1 ? <Path key={`a${k}`} d={area(seg)} fill="url(#area)" /> : null,
              )}
              {segments.map((seg, k) =>
                seg.length > 1 ? (
                  <Path key={`l${k}`} d={line(seg)} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                ) : (
                  <Circle key={`p${k}`} cx={x(seg[0].i)} cy={y(seg[0].v)} r={3} fill={stroke} />
                ),
              )}
              {lastIndex >= 0 ? (
                <Circle cx={x(lastIndex)} cy={y(values[lastIndex]!)} r={5} fill={t.card} stroke={stroke} strokeWidth={2.5} />
              ) : null}
            </Svg>
          </Animated.View>
        ) : null}
        <Text className="absolute right-0 top-0 text-[10px] text-muted dark:text-muted-dark">100%</Text>
        <Text className="absolute right-0 text-[10px] text-muted dark:text-muted-dark" style={{ top: H / 2 - 12 }}>
          50%
        </Text>
      </View>
      {labels ? (
        <View className="mt-2 flex-row justify-between">
          {labels.map((l, i) => (
            <Text key={i} className="text-[10px] font-semibold text-muted dark:text-muted-dark" numberOfLines={1}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
