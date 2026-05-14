/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#dde1ea',
          300: '#bcc3d2',
          400: '#8993a8',
          500: '#5f6a82',
          600: '#475064',
          700: '#343c4d',
          800: '#222836',
          900: '#141923',
          950: '#0a0d14',
        },
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,25,35,0.04), 0 1px 1px rgba(20,25,35,0.03)',
        panel: '0 1px 3px rgba(20,25,35,0.06), 0 0 0 1px rgba(20,25,35,0.04)',
      },
    },
  },
  plugins: [],
};
