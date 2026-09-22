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


/**
 * A page that acts on a mailed link has to check it before drawing the form.
 *
 * Both of them did not. The reset page rendered the password fields whatever
 * state the link was in and only said "this link is no longer valid" after
 * somebody had invented a password and typed it twice. The registration page
 * was worse: it checked only that an `invite` parameter existed, so a spent
 * invitation cost four fields of typing before it said no.
 *
 * A form is a promise that filling it in will do something. The way that
 * promise gets broken again is somebody moving the form back into the page to
 * "simplify" it — at which point the page needs `'use client'`, the check
 * cannot run on the server any more, and nothing else notices.
 *
 * So: these pages stay server components, and they consult lib/linkState.
 */
const LINK_PAGES = [
    ['src/app/[locale]/reset/page.tsx', 'linkState'],
    ['src/app/[locale]/register/page.tsx', 'inviteLinkState'],
];

for (const [page, helper] of LINK_PAGES) {
    let text;

    try {
        text = readFileSync(page, 'utf8');
    } catch {
        problems.push(`${page} is missing, and it is the page that checks a mailed link.`);
        continue;
    }

    if (/^\s*'use client'/m.test(text)) {
        problems.push(
            `${page} is a client component.\n` +
            '    It has to stay on the server: the link is checked before the form is\n' +
            '    drawn, and a client component cannot do that without a round trip.'
        );
    }

    if (!text.includes(helper)) {
        problems.push(
            `${page} does not call ${helper}().\n` +
            '    Without it the form is shown for a link that has already been used,\n' +
            '    and the person finds out only after filling it in.'
        );
    }
}

if (problems.length > 0) {
    console.error('Design rules:\n');
    for (const problem of problems) console.error(`  ${problem}\n`);
    process.exit(1);
}

console.log(
    `check:design — ${scanned} files, no colours outside the tokens, ` +
    'no primary buttons outside lib/ui, and both link pages check before they ask.'
);
