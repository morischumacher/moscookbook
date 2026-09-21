/**
 * Refuses colours that bypass the design tokens.
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

const problems = [];
let scanned = 0;

for (const file of walk('src')) {
    // globals.css is where the palette is allowed to be literal — it is the
    // one file that defines the tokens.
    if (file.endsWith('globals.css')) continue;

    scanned += 1;
    const lines = readFileSync(file, 'utf8').split('\n');

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

console.log(`check:design — ${scanned} files, no colours outside the tokens.`);
