import type { Config } from 'tailwindcss';

/**
 * Los colores salen del logo de ZUUUM FIBRA, medidos pixel por pixel:
 *   naranja  #EA6613  — el rayo y la palabra FIBRA
 *   marino   #2E2F44  — la palabra ZUUUM
 * Las escalas se generaron mezclando esos dos tonos con blanco y con negro,
 * para que todo el panel se vea de la misma familia.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        naranja: {
          50: '#fef7f3',
          100: '#fcede3',
          200: '#fad7c2',
          300: '#f6bc97',
          400: '#f0945a',
          500: '#ea6613',
          600: '#ce5a11',
          700: '#ad4b0e',
          800: '#8c3d0b',
          900: '#6c2f09',
          950: '#461f06',
        },
        marino: {
          50: '#f5f5f6',
          100: '#e6e6e9',
          200: '#c9c9ce',
          300: '#a3a3ad',
          400: '#6d6d7c',
          500: '#2e2f44',
          600: '#28293c',
          700: '#222332',
          800: '#1c1c29',
          900: '#15161f',
          950: '#0e0e14',
        },
        // Alias cómodos
        marca: {
          50: '#fef7f3',
          100: '#fcede3',
          200: '#fad7c2',
          300: '#f6bc97',
          400: '#f0945a',
          500: '#ea6613',
          600: '#ce5a11',
          700: '#ad4b0e',
          800: '#8c3d0b',
          900: '#6c2f09',
          950: '#461f06',
        },
        exito: '#15a34a',
        aviso: '#d97706',
        falla: '#dc2626',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(46, 47, 68, 0.06), 0 1px 3px rgba(46, 47, 68, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
