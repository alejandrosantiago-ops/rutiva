import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Logo de Rutiva: cuadrado redondeado con un anillo de progreso y un check.
 * Es el mismo dibujo que los iconos de `assets/` (ver scripts/generate-icons.ps1).
 */
export function Logo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Logo de Rutiva">
      <Defs>
        <LinearGradient id="rutivaBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7472F0" />
          <Stop offset="1" stopColor="#4B48C2" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" rx="24" fill="url(#rutivaBg)" />
      {/* Pista del anillo */}
      <Circle cx="50" cy="50" r="27" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth="8" fill="none" />
      {/* Progreso (3/4 del anillo, empezando arriba) */}
      <Path d="M50 23 A27 27 0 1 1 23 50" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Check */}
      <Path d="M38 51 L47 60 L63 42" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
