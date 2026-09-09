/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cafe: { DEFAULT: '#6f4e37', dark: '#4e3524' },
        cacao: { DEFAULT: '#7b3f00', dark: '#5a2e00' },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
