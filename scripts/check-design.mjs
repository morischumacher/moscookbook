/**
 * Refuses colours that bypass the design tokens, and buttons that bypass the
 * shapes.
 *
 *   npm run check:design
 *
 * The site has one palette, defined once in globals.css and measured for
 * contrast by check:contrast. A literal like `text-blue-600` sidesteps both: it
 * has no dark-mode counterpart unless someone remembers to write one, it is
 * never measured, and it makes a page look like it came from somewhere else.
 *
 * That is not hypothetical. The greeting in the mobile menu was
 * `text-blue-600 dark:text-blue-400` — a blue that appeared nowhere else — and
 * it sat directly above a centred "Logout" and a serif language switch. Three
 * lines, three different rules. This is the rule that stops the first of those.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const PALETTE =
    'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|' +
    'blue|indigo|violet|purple|fuchsia|pink|rose';

const LITERAL = new RegExp(
    `\\b(?:text|bg|border|ring|decoration|divide|from|to|via|outline|caret|accent|shadow)-(?:${PALETTE})-\\d{2,3}\\b`,
    'g'
);

/** What to use instead, so the message is actionable rather than a scolding. */
const SUGGESTIONS = [
    [/-(red|rose)-/, 'danger'],
    [/-(green|emerald|lime|teal)-/, 'success'],
    [/-(orange|amber)-/, 'accent or accent-text'],
    [/-(slate|gray|zinc|neutral|stone)-/, 'muted, faint, line or surface'],
];

function suggestionFor(literal) {
    for (const [pattern, token] of SUGGESTIONS) {
        if (pattern.test(literal)) return token;
    }
    return 'one of the tokens in globals.css';
}

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

/**
 * A hand-rolled primary button.
 *
 * There were five, and none of it was a decision: `px-6 py-3` here,
 * `px-4 py-2 text-sm` there, `px-5 py-2` on exactly one page, and two admin
 * pages under the same navigation with visibly different-sized buttons. It is
 * what happens when a class list is copied from whichever file was open —
 * invisible to whoever writes the page, obvious to whoever looks at two of
 * them. src/lib/ui.ts holds the four shapes now.
 *
 * Matched on the filled pill with a label on it, because that is the one that
 * was drifting: `rounded-full`, a solid `bg-ink`, and `text-page` for the
 * words. A bordered button is not a shape people copy wrongly, and a class
 * with a slash in it is a translucent overlay — the corner the heart sits in,
 * the pill the rating sits in — which is a different thing that happens to be
 * round. Those live on the scrim tokens now (lib/ui.ts), so they would not
 * match this in any case; the negative lookahead stays because the rule is
 * about the shape, not about which token is current this month.
 */
const HAND_ROLLED_BUTTON = /rounded-full[^"'`]*\bbg-ink(?!\/)\b[^"'`]*\btext-page\b/;

const problems = [];
let scanned = 0;

for (const file of walk('src')) {
    // globals.css is where the palette is allowed to be literal — it is the
    // one file that defines the tokens.
    if (file.endsWith('globals.css')) continue;

    scanned += 1;
    const lines = readFileSync(file, 'utf8').split('\n');

    // src/lib/ui.ts is where the shapes are allowed to be written out — it is
    // the file that defines them.
    if (!file.endsWith(join('lib', 'ui.ts'))) {
        lines.forEach((line, index) => {
            if (!HAND_ROLLED_BUTTON.test(line)) return;

            problems.push(
                `${relative('.', file)}:${index + 1}  a primary button written out by hand\n` +
                '    Use buttonPrimary, buttonPrimarySmall or buttonDanger from src/lib/ui.ts,\n' +
                '    or add the shape there if this one is genuinely different.'
            );
        });
    }

    lines.forEach((line, index) => {
        for (const match of line.matchAll(LITERAL)) {
            problems.push(
                `${relative('.', file)}:${index + 1}  ${match[0]}\n` +
                `    Use ${suggestionFor(match[0])} instead, so it follows dark mode and gets measured.`
            );
        }
    });
}

if (problems.length > 0) {
    console.error('Colours that bypass the design tokens:\n');
    for (const problem of problems) console.error(`  ${problem}\n`);
    process.exit(1);
}

console.log(
    `check:design — ${scanned} files, no colours outside the tokens ` +
    'and no primary buttons outside lib/ui.'
);
