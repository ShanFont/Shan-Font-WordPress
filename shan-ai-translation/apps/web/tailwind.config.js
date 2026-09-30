/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f3efe7',
        ink: '#1c1917',
        muted: '#78716c',
        line: '#e6dfd4',
        card: '#fffcf8',
        teal: { DEFAULT: '#0f766e', dark: '#115e59' },
        danger: '#b42318',
      },
      borderRadius: { xl: '12px' },
      fontFamily: {
        sans: ['"Source Sans 3"', 'sans-serif'],
        shan: ['"Noto Sans Myanmar"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
