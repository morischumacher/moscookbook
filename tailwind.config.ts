import type { Config } from 'tailwindcss'

/**
 * Colours are named by role, not by shade, and resolve to the CSS custom
 * properties in globals.css. That is what makes dark mode work without a
 * `dark:` variant on every element: only the variable changes.
 *
 *   page      page background
 *   ink       body text and headings
 *   muted     secondary text — meta lines, hints, captions
 *   faint     tertiary — eyebrows, counts, placeholder icons
 *   line      hairline rules and input borders
 *   surface   subtle fills — thumbnails, panels
 *   danger    destructive actions only (with .surface and .line for alerts)
 *   scrim     a darkening laid over a photograph or the page
 *   on-scrim  what is legible on top of that darkening
 *
 * The last two do not change between light and dark, and that is the point of
 * them — see globals.css.
 */

/**
 * A colour that survives an opacity modifier.
 *
 * These used to be written as the plain string `'var(--color-fg)'`, which is
 * the obvious thing to write and quietly broke every translucent surface on
 * the site. Tailwind cannot parse a `var()` into channels, so it cannot fold
 * an alpha into it — and rather than failing, it **drops the utility
 * altogether**: `bg-ink/75` compiled to no rule at all. Ten classes were
 * affected, and every one of them was a background whose whole job was to be
 * semi-transparent:
 *
 *   - the rating badge on a tile — no pill, so a white number sat on whatever
 *     the photograph happened to be, which is where this was finally noticed
 *   - the favourite button's backing, on the tile and in the gallery strip
 *   - all three lightbox controls
 *   - the backdrop behind the confirmation dialog
 *   - the cover behind the open mobile menu, which was added specifically to
 *     stop the search field showing through it and had never once done so
 *
 * None of these threw anything. They are missing backgrounds, and a missing
 * background is invisible against roughly half the photographs people upload.
 *
 * `color-mix` is what fixes it: it composites at paint time, so the variable
 * stays a variable and can still be read straight out of plain CSS as
 * `var(--color-fg)` — which four stylesheets and one SVG do. The obvious
 * alternative, storing the tokens as bare channel triplets (`17 17 17`) and
 * writing `rgb(var(--x) / <alpha-value>)`, would work here too, but it makes
 * every direct use in plain CSS silently invalid instead. That is the same
 * failure this comment exists because of, pointed the other way.
 *
 * `scripts/check-tokens.mjs` now compiles the real config and fails if any
 * colour utility in the source produces no declaration, so the next token
 * added in the wrong shape is caught at `npm run check` rather than by
 * somebody looking at their phone.
 */
/*
 * The cast is deliberate and it is the only dishonest line in this file.
 *
 * Tailwind's runtime calls a colour that is a function and hands it the
 * opacity — `withAlphaValue` begins `if (typeof color === 'function') return
 * color({ opacityValue })`. Its *published* types do not model that: a colour
 * in the theme is declared `string | RecursiveKeyValuePair`, so `satisfies
 * Config` rejects the very thing the implementation is built to accept.
 *
 * Asserting `string` here is therefore a statement about Tailwind's types
 * being narrower than Tailwind, not about this value being a string. It is
 * confined to this one line, and `npm run check:tokens` compiles the real
 * config and fails if the functions ever stop being called.
 */
const token = (name: string): string =>
  ((({ opacityValue }: { opacityValue?: string | number } = {}) => {
    const alpha = Number(opacityValue)

    // Undefined for a plain `bg-ink`; `var(--tw-bg-opacity)` — which is not a
    // number — for the same class once another plugin has set that variable.
    // Both mean "fully opaque", and both must return the variable untouched
    // rather than a `color-mix` of NaN percent.
    if (!Number.isFinite(alpha) || alpha >= 1) return `var(${name})`

    // One decimal. `0.55` arrives as 55.00000000000001 otherwise, which is
    // correct and looks like a mistake in the compiled stylesheet.
    return `color-mix(in srgb, var(${name}) ${Math.round(alpha * 1000) / 10}%, transparent)`
  }) as unknown as string)

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        page: token('--color-bg'),
        ink: token('--color-fg'),
        muted: token('--color-muted'),
        faint: token('--color-faint'),
        line: token('--color-border'),
        control: token('--color-control'),
        surface: token('--color-surface'),
        success: token('--color-success'),
        scrim: token('--color-scrim'),
        'on-scrim': token('--color-on-scrim'),
        accent: {
          DEFAULT: token('--color-accent'),
          text: token('--color-accent-text'),
        },
        danger: {
          DEFAULT: token('--color-danger'),
          surface: token('--color-danger-surface'),
          line: token('--color-danger-line'),
        },
      },
    },
  },
  plugins: [],
} satisfies Config
