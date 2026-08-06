/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Colores personalizados para trading
        profit: {
          light: '#dcfce7',
          DEFAULT: '#22c55e',
          dark: '#15803d',
        },
        loss: {
          light: '#fee2e2',
          DEFAULT: '#ef4444',
          dark: '#b91c1c',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // Variante `touch:` para dispositivos sin hover (tablets/PWA). Permite mostrar
    // los controles que en desktop solo aparecen con hover (`group-hover:`), que en
    // pantallas táctiles quedaban inalcanzables.
    require('tailwindcss/plugin')(({ addVariant }) => {
      addVariant('touch', '@media (hover: none)');
    }),
  ],
};
