/**
 * Checks the colour tokens against WCAG contrast, in both themes.
 *
 *   npm run check:contrast
 *
 * Colour contrast is the accessibility problem that is invisible to the person
 * who chose the colours: it looks fine on the laptop it was picked on, and
 * fails in daylight, on a cheap phone screen, or to about one reader in twelve.
 * A number cannot be argued with, so it is checked rather than eyeballed.
 *
 * This caught --color-faint at 2.41:1 on the page background — below even the
 * 3:1 asked of a graphic, while carrying every uppercase label on the site.
 *
 * Thresholds are WCAG 2.1 AA: 4.5 for body text, 3.0 for large text and for
 * graphics you have to be able to make out. Hairlines are exempt and say so:
 * a rule between two rows is decoration, and a 4.5:1 rule would be a fence.
 */
import { readFileSync } from 'fs';

const CSS = readFileSync('src/app/globals.css', 'utf8');

/**
 * Pulls `--color-name: value;` out of one block of the stylesheet, keyed by the
 * part after `color-` so the rules below read as roles rather than as variable
 * names.
 */
function tokensIn(block) {
    const found = new Map();
    for (const match of block.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
        found.set(match[1].trim(), match[2].trim());
    }
    return found;
}

const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(CSS);
const darkBlock = /prefers-color-scheme:\s*dark[\s\S]*?:root\s*\{([\s\S]*?)\n\s*\}/.exec(CSS);

if (!rootBlock || !darkBlock) {
    console.error('Could not find both the :root and the dark-mode blocks in globals.css.');
    process.exit(1);
}

const light = tokensIn(rootBlock[1]);
const dark = new Map([...light, ...tokensIn(darkBlock[1])]);

function toRgb(value) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
    if (hex) {
        return [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16));
    }
    return null;
}

function luminance([r, g, b]) {
    const channels = [r, g, b]
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
    const a = luminance(foreground);
    const b = luminance(background);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
}

/** token, the least it may be, and what it is for. */
const RULES = [
    ['fg', 4.5, 'body text and headings'],
    ['muted', 4.5, 'secondary text: meta lines, hints, captions'],
    ['faint', 4.5, 'eyebrows and counts — small, so the text threshold applies'],
    ['danger', 4.5, 'error messages'],
    ['accent-text', 4.5, 'links and labels in the brand colour'],
    ['accent', 3.0, 'the oyster and other shapes — a graphic, not words'],
];

/** Tokens that are meant to be barely there. */
const DECORATIVE = new Set(['border', 'surface', 'danger-surface', 'danger-line', 'neutral']);

let failures = 0;

for (const [themeName, tokens] of [['light', light], ['dark', dark]]) {
    const background = toRgb(tokens.get('bg') ?? '');

    if (!background) {
        console.error(`${themeName}: --color-bg is not a plain hex colour, so nothing can be measured.`);
        process.exit(1);
    }

    for (const [name, minimum, purpose] of RULES) {
        const raw = tokens.get(name);

        if (!raw) {
            console.error(`${themeName}: --color-${name} is missing.`);
            failures += 1;
            continue;
        }

        const colour = toRgb(raw);
        if (!colour) {
            console.error(`${themeName}: --color-${name} (${raw}) is not a plain hex colour.`);
            failures += 1;
            continue;
        }

        const ratio = contrast(colour, background);

        if (ratio < minimum) {
            console.error(
                `${themeName}: --color-${name} (${raw}) is ${ratio.toFixed(2)}:1 against the page, ` +
                `below the ${minimum}:1 needed for ${purpose}.`
            );
            failures += 1;
        } else {
            console.log(`  ok   ${themeName.padEnd(5)} --color-${name.padEnd(12)} ${ratio.toFixed(2)}:1`);
        }
    }
}

// Named so that a reader of this file knows the omission is deliberate.
console.log(`  --   not measured: ${[...DECORATIVE].join(', ')} (decorative by design)`);

if (failures > 0) {
    console.error(`\n${failures} colour token(s) below the contrast they need.`);
    process.exit(1);
}

console.log('\ncheck:contrast — every token meets WCAG AA.');
