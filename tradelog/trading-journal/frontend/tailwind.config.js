/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
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
  plugins: [],
};
