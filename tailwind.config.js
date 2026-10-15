import forms from '@tailwindcss/forms';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', '"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        arena: {
          cream: '#F7F4EC',
          surface: '#FFFDF9',
          border: '#E8E2D5',
          terracotta: '#C66A3D',
          'terracotta-dark': '#B25A30',
          sage: '#718B69',
          'sage-dark': '#5F7658',
          charcoal: '#211E1C',
          muted: '#8C857B',
          'muted-light': '#F0EBE1',
        },
        brand: {
          terracotta: '#C66A3D',
          'terracotta-dark': '#B25B30',
          terracottaHover: '#B25D32',
          teal: '#5C828C',
          gold: '#C59A44',
          violet: '#886F99',
          sage: '#6E8761',
          rose: '#A65D67',
          cream: '#F7F2EA',
          sand: '#F7F3EC',
          parchment: '#FDFBF7',
          card: '#FFFFFF',
          cardBg: '#F8FAF5',
          border: '#EDE6DC',
          muted: '#8C857B',
          charcoal: '#221F1B',
          dark: '#1C1917',
          badge: '#EDE7DC',
          success: '#4E8B63',
          danger: '#BD5348',
        },
      },
      boxShadow: {
        'soft-card': '0 20px 40px -15px rgba(80, 68, 55, 0.07), 0 0 1px 1px rgba(80, 68, 55, 0.05)',
        'soft': '0 20px 45px -15px rgba(140, 115, 90, 0.08), 0 4px 16px -2px rgba(140, 115, 90, 0.04)',
        'card': '0 20px 45px -12px rgba(110, 85, 60, 0.08), 0 4px 16px -2px rgba(110, 85, 60, 0.04)',
        'nav-pill': '0 8px 24px -6px rgba(100, 85, 70, 0.08), 0 2px 6px -2px rgba(100, 85, 70, 0.04)',
        'nav': '0 6px 20px -3px rgba(180, 150, 130, 0.12), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
        'pill': '0 3px 10px rgba(198, 106, 61, 0.28)',
        'terracotta': '0 4px 14px -2px rgba(198, 106, 61, 0.35)',
        'input-focus': '0 0 0 3px rgba(198, 106, 61, 0.18)',
      },
    },
  },
  plugins: [forms, containerQueries],
};
