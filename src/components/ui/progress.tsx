import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Anillo de progreso animado (0…1). */
export function ProgressRing({
  progress,
  size = 120,
  stroke = 12,
  color,
  trackColor,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = useSharedValue(0);

  useEffect(() => {
    value.set(withTiming(Math.min(1, Math.max(0, progress)), { duration: 900, easing: EASE }));
  }, [progress, value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - value.value),
  }));

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? t.subtle} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color ?? t.brand}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Barra de progreso horizontal animada (0…1). */
export function ProgressBar({
  progress,
  color,
  height = 8,
  className,
}: {
  progress: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  const t = useTheme();
  const value = useSharedValue(0);
  useEffect(() => {
    value.set(withTiming(Math.min(1, Math.max(0, progress)), { duration: 700, easing: EASE }));
  }, [progress, value]);
  const style = useAnimatedStyle(() => ({ width: `${value.value * 100}%` }));
  return (
    <View
      className={`overflow-hidden rounded-full bg-subtle dark:bg-subtle-dark ${className ?? ''}`}
      style={{ height }}
    >
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color ?? t.brand }, style]} />
    </View>
  );
}

/** Columna de un gráfico de barras que crece al montarse. */
export function AnimatedBar({
  ratio,
  maxHeight,
  color,
  width = 18,
  delay = 0,
}: {
  ratio: number;
  maxHeight: number;
  color: string;
  width?: number;
  delay?: number;
}) {
  const h = useSharedValue(0);
  useEffect(() => {
    const target = Math.max(ratio > 0 ? 4 : 0, Math.min(1, ratio) * maxHeight);
    const timer = setTimeout(() => {
      h.set(withTiming(target, { duration: 650, easing: EASE }));
    }, delay);
    return () => clearTimeout(timer);
  }, [ratio, maxHeight, delay, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[{ width, borderRadius: width / 2.4, backgroundColor: color }, style]} />;
}
