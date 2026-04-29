import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          500: '#E8632B',
          600: '#C8531E',
        },
        green: {
          500: '#1B9E77',
          600: '#168A68',
        },
        dark: '#2D2926',
        warm: '#F9F5F2',
        // CSS variable-backed theme colors (light/dark via data-theme)
        'bp-bg': 'var(--bp-bg)',
        'bp-card': 'var(--bp-card)',
        'bp-text': 'var(--bp-text)',
        'bp-muted': 'var(--bp-muted)',
        'bp-subtle': 'var(--bp-subtle)',
        'bp-border': 'var(--bp-border)',
        'bp-hover': 'var(--bp-hover)',
        'bp-header': 'var(--bp-header)',
        // Admin portal mirrors the bp-* token system so admin pages can
        // share the same visual language as the business + inspector
        // portals. Same names, --ap-* prefix to keep them isolated.
        'ap-bg': 'var(--ap-bg)',
        'ap-card': 'var(--ap-card)',
        'ap-text': 'var(--ap-text)',
        'ap-muted': 'var(--ap-muted)',
        'ap-subtle': 'var(--ap-subtle)',
        'ap-border': 'var(--ap-border)',
        'ap-hover': 'var(--ap-hover)',
        'ap-header': 'var(--ap-header)',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
