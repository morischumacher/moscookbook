/**
 * Refuses a colour class that compiles to nothing.
 *
 *   npm run check:tokens
 *
 * Tailwind does not fail when it cannot build a utility. It omits it. Write
 * `bg-ink/75` against a colour it cannot parse into channels and you get no
 * rule, no warning and no error — the element simply has no background, which
 * against roughly half the photographs anybody uploads is indistinguishable
 * from a background that is working.
 *
 * That is not a hypothetical either. Every translucent surface on this site
 * was missing, all at once, for as long as the tokens have existed:
 *
 *   - the rating badge on a tile          bg-ink/75
 *   - the favourite button's backing      bg-ink/55   (twice)
 *   - all three lightbox controls         bg-page/15
 *   - the lightbox's page counter         text-page/80
 *   - the backdrop behind a dialog        bg-ink/25
 *   - the cover behind the mobile menu    bg-page/80
 *   - a focus ring on the recipe form     ring-ink/20
 *
 * Ten classes, in seven files, written over months by somebody reading the
 * compiled page and seeing what looked like a design decision. It was found
 * because a black oyster on a light wooden table finally looked wrong enough
 * to photograph.
 *
 * So this compiles the real config against the real source and checks that
 * every colour utility the source asks for actually exists in the output. It
 * is not a lint rule about how the tokens are written — it is the question the
 * bug was hiding behind: *did the class survive the build?*
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { createRequire } from 'module';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import resolveConfig from 'tailwindcss/resolveConfig.js';

// Tailwind's own loader, because the config is TypeScript and this script is
// not: it runs the file through jiti the same way the build does, so what is
// checked here is the config the site is actually compiled with rather than a
// second copy of it that can drift.
const require = createRequire(import.meta.url);
const { loadConfig } = require('tailwindcss/lib/lib/load-config.js');

/** Utilities that take a colour, and so can take an opacity modifier. */
const PREFIXES = [
    'bg', 'text', 'border', 'ring', 'ring-offset', 'divide', 'outline',
    'decoration', 'placeholder', 'caret', 'accent', 'shadow', 'fill', 'stroke',
    'from', 'to', 'via',
];

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx|css)$/.test(full)) out.push(full);
    }
    return out;
}

/** The CSS escaping Tailwind uses for a class name, for `.bg-ink\/75`. */
function escapeClass(name) {
    return name.replace(/[/.:[\]%]/g, (character) => `\\${character}`);
}

const config = loadConfig(resolve('tailwind.config.ts'));
const resolved = resolveConfig(config);

/**
 * Every colour name the theme defines, including the nested ones, written the
 * way a class writes them: `accent`, `accent-text`, `danger-surface`.
 *
 * Read from the resolved config rather than listed here, so that a token added
 * tomorrow is covered tonight.
 */
const tokenNames = new Set();
for (const [name, value] of Object.entries(resolved.theme.colors ?? {})) {
    if (typeof value === 'object' && value !== null) {
        for (const shade of Object.keys(value)) {
            tokenNames.add(shade === 'DEFAULT' ? name : `${name}-${shade}`);
        }
    } else {
        tokenNames.add(name);
    }
}

// `bg-ink/75`, `text-on-scrim/80`, `ring-accent-text/20`. The token part is
// greedy over hyphens and checked against the set above, which is what keeps
// `bg-gradient-to-r/50`-shaped nonsense out of the results.
const CANDIDATE = new RegExp(
    `\\b(${PREFIXES.join('|')})-([a-z][a-z0-9-]*)\\/(\\d{1,3})\\b`,
    'g'
);

const wanted = new Map();

for (const file of walk('src')) {
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
        // The prefix is captured so the pattern can require one, not used:
        // what matters afterwards is the whole class and the token it names.
        for (const [full, , name] of line.matchAll(CANDIDATE)) {
            if (!tokenNames.has(name)) continue;
            if (!wanted.has(full)) wanted.set(full, `${relative('.', file)}:${index + 1}`);
        }
    });
}

if (wanted.size === 0) {
    console.log('check:tokens — no colour utilities with an opacity modifier found.');
    process.exit(0);
}

// The real config, so that a change to it is what this measures. Content is
// overridden with the exact classes in question: scanning src again here would
// only re-derive the same list more slowly, and pinning it makes the failure
// message point at a class rather than at a file.
const css = await postcss([
    tailwindcss({
        ...config,
        content: [{ raw: [...wanted.keys()].join(' '), extension: 'html' }],
    }),
]).process('@tailwind utilities;', { from: undefined });

const missing = [];

for (const [className, where] of wanted) {
    const selector = `.${escapeClass(className)}`;

    // The rule has to exist *and* carry a declaration. Tailwind drops the
    // whole rule in the case this was written for, but an empty rule would be
    // the same bug wearing a hat.
    let found = false;

    css.root.walkRules(selector, (rule) => {
        if (rule.nodes.some((node) => node.type === 'decl' && node.value.trim() !== '')) {
            found = true;
        }
    });

    if (!found) missing.push(`${where}  ${className}`);
}

if (missing.length > 0) {
    console.error('Colour classes that compile to nothing:\n');
    for (const entry of missing) console.error(`  ${entry}`);
    console.error(
        '\n  Tailwind drops an opacity modifier on a colour it cannot parse — a bare\n' +
        "  `var(--x)` in the theme. tailwind.config.ts wraps every token in a function\n" +
        '  that returns color-mix() instead; a new token has to go through the same one.\n'
    );
    process.exit(1);
}

console.log(
    `check:tokens — ${wanted.size} colour utilities with an opacity modifier, all present in the build.`
);
