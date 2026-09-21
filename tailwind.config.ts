import type { Config } from 'tailwindcss'

/**
 * Colours are named by role, not by shade, and resolve to the CSS custom
 * properties in globals.css. That is what makes dark mode work without a
 * `dark:` variant on every element: only the variable changes.
 *
 *   page     page background
 *   ink      body text and headings
 *   muted    secondary text — meta lines, hints, captions
 *   faint    tertiary — eyebrows, counts, placeholder icons
 *   line     hairline rules and input borders
 *   surface  subtle fills — thumbnails, panels
 *   danger   destructive actions only (with .surface and .line for alerts)
 */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        page: 'var(--color-bg)',
        ink: 'var(--color-fg)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        line: 'var(--color-border)',
        surface: 'var(--color-surface)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          text: 'var(--color-accent-text)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          surface: 'var(--color-danger-surface)',
          line: 'var(--color-danger-line)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
