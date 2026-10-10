/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // All colours are driven by CSS variables so the light and dark themes
        // share one component layer. Values are space separated RGB channels.
        canvas: 'rgb(var(--sf-canvas) / <alpha-value>)',
        surface: 'rgb(var(--sf-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--sf-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--sf-surface-3) / <alpha-value>)',
        line: 'rgb(var(--sf-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--sf-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--sf-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--sf-ink-muted) / <alpha-value>)',
        'ink-subtle': 'rgb(var(--sf-ink-subtle) / <alpha-value>)',
        accent: 'rgb(var(--sf-accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--sf-accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--sf-accent-soft) / <alpha-value>)',
        signal: 'rgb(var(--sf-signal) / <alpha-value>)',
        'signal-soft': 'rgb(var(--sf-signal-soft) / <alpha-value>)',
        warn: 'rgb(var(--sf-warn) / <alpha-value>)',
        'warn-soft': 'rgb(var(--sf-warn-soft) / <alpha-value>)',
        danger: 'rgb(var(--sf-danger) / <alpha-value>)',
        'danger-soft': 'rgb(var(--sf-danger-soft) / <alpha-value>)',
        info: 'rgb(var(--sf-info) / <alpha-value>)',
        'info-soft': 'rgb(var(--sf-info-soft) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.06), 0 1px 1px rgb(0 0 0 / 0.04)',
        raised: '0 10px 30px -12px rgb(0 0 0 / 0.35)',
        'inner-line': 'inset 0 0 0 1px rgb(var(--sf-line) / 1)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
