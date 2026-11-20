const { palette } = require('./src/theme/palette');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: palette.brand,
        canvas: { DEFAULT: palette.light.canvas, dark: palette.dark.canvas },
        card: { DEFAULT: palette.light.card, dark: palette.dark.card },
        elevated: { DEFAULT: palette.light.elevated, dark: palette.dark.elevated },
        line: { DEFAULT: palette.light.line, dark: palette.dark.line },
        ink: { DEFAULT: palette.light.ink, dark: palette.dark.ink },
        muted: { DEFAULT: palette.light.muted, dark: palette.dark.muted },
        subtle: { DEFAULT: palette.light.subtle, dark: palette.dark.subtle },
        success: palette.success,
        warning: palette.warning,
        danger: palette.danger,
        sleep: palette.sleep,
      },
      borderRadius: {
        '4xl': '28px',
      },
    },
  },
  plugins: [],
};
