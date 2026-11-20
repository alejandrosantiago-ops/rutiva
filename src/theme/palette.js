// Fuente única de colores. La consumen tailwind.config.js (clases) y
// src/theme/colors.ts (props que no aceptan className: iconos, SVG, calendario).
const palette = {
  brand: {
    50: '#EEF0FF',
    100: '#E0E3FF',
    200: '#C6CBFF',
    300: '#A3A9FB',
    400: '#8085F2',
    500: '#5B5BD6',
    600: '#4B48C2',
    700: '#3D3A9E',
    800: '#33317F',
    900: '#2C2B66',
  },
  light: {
    canvas: '#F5F6FA',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    line: '#E8EAF0',
    ink: '#0E1116',
    muted: '#6B7280',
    subtle: '#EEF0F5',
  },
  dark: {
    canvas: '#0B0C10',
    card: '#16181F',
    elevated: '#1D2029',
    line: '#262934',
    ink: '#F2F4F8',
    muted: '#8C93A5',
    subtle: '#1F222C',
  },
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  sleep: '#7C6CF2',
};

module.exports = { palette };
