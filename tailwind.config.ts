import type { Config } from 'tailwindcss';
import tokens from './src/styles/tokens.json';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Martin Builder Design Tokens (mb- prefix)
        'mb-blue': tokens.colors.brand.blue.value,
        'mb-yellow': tokens.colors.brand.yellow.value,
        'mb-dark-blue': tokens.colors.brand['dark-blue'].value,
        'mb-success': tokens.colors.status.success.value,
        'mb-warning': tokens.colors.status.warning.value,
        'mb-error': tokens.colors.status.error.value,
        'mb-bg': tokens.colors.ui.background.value,
        'mb-border': tokens.colors.ui.border.value,
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        orange: {
          DEFAULT: 'hsl(var(--orange))',
          foreground: 'hsl(var(--orange-foreground))',
          muted: 'hsl(var(--orange-muted))',
          light: 'hsl(var(--orange-light))',
          dark: 'hsl(var(--orange-dark))',
          accent: 'hsl(var(--orange-accent))',
        },
        'green-light': 'hsl(var(--green-light))',
        'green-border': 'hsl(var(--green-border))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: [tokens.fontFamilies.main.value, 'system-ui', 'sans-serif'],
        mono: [tokens.fontFamilies.mono.value, 'monospace'],
      },
      spacing: {
        'mb-header': tokens.spacing['header-height'].value,
        'mb-sidebar': tokens.spacing['sidebar-width'].value,
        'mb-padding': tokens.spacing['padding-standard'].value,
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'medium': '0 4px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.08)',
        'strong': '0 8px 24px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.10)',
        'glow-primary': '0 8px 32px rgba(37, 99, 73, 0.20)',
        'glow-orange': '0 8px 32px rgba(251, 113, 56, 0.25)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
