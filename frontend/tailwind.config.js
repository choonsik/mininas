/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          base: 'var(--surface-base)',
          header: 'var(--surface-header)',
          sidebar: 'var(--surface-sidebar)',
          card: 'var(--surface-card)',
          cardHover: 'var(--surface-card-hover)',
          border: 'var(--surface-border)',
          borderSubtle: 'var(--surface-border-subtle)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
          btn: 'var(--btn-primary-bg)',
          btnHover: 'var(--btn-primary-hover)',
          btnText: 'var(--btn-primary-text)',
          btnBorder: 'var(--btn-primary-border)',
        },
        content: {
          primary: 'var(--content-primary)',
          secondary: 'var(--content-secondary)',
          muted: 'var(--content-muted)',
        }
      },
      fontSize: {
        xs: ['calc(0.75rem * var(--font-scale, 1))', { lineHeight: 'calc(1rem * var(--font-scale, 1))' }],
        sm: ['calc(0.875rem * var(--font-scale, 1))', { lineHeight: 'calc(1.25rem * var(--font-scale, 1))' }],
        base: ['calc(1rem * var(--font-scale, 1))', { lineHeight: 'calc(1.5rem * var(--font-scale, 1))' }],
        lg: ['calc(1.125rem * var(--font-scale, 1))', { lineHeight: 'calc(1.75rem * var(--font-scale, 1))' }],
        xl: ['calc(1.25rem * var(--font-scale, 1))', { lineHeight: 'calc(1.75rem * var(--font-scale, 1))' }],
        '2xl': ['calc(1.5rem * var(--font-scale, 1))', { lineHeight: 'calc(2rem * var(--font-scale, 1))' }],
      },
      borderRadius: {
        none: '0px',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'calc(var(--radius) * 1.5)',
        xl: 'calc(var(--radius) * 2)',
      }
    },
  },
  plugins: [],
}
