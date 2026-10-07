import { capitalized, sectionHeading } from './ingredientParts';

/**
 * How an ingredient is written in this cookbook:
 *
 *     Zutat, Form (Zusatz) (optional)
 *     Knoblauch, gehackt (große Zehen) (optional)
 *     Garlic, minced (large cloves) (optional)
 *
 * - the ingredient itself first, with a capital in both languages: what is bought, what the catalogue
 *   (lib/ingredientCatalog) and the shopping list track;
 * - after the comma, how it goes into the dish: "gehackt", "in Streifen",
 *   "fein gerieben" — the same thing to buy, handled differently;
 * - in brackets, anything else worth knowing: a size, "Bio", "zum Garnieren";
 * - "(optional)" last, for what the dish can do without. On the shopping
 *   list it goes under "Optional".
 *
 * Everything but the first part may be missing. `shapeOf` reads a name in any
 * of the ways recipes come in ("frischer Ingwer", "2 large eggs", "Butter
 * (weich)", "optional: Chiliflocken") and `formatShape` writes it the one
 * way; `conventional` does both. Only words that are known to be a form or a
 * size are moved — "rote Zwiebel" and "gemahlener Kreuzkümmel" are other
 * things to buy, and stay as they are.
 */

export interface IngredientShape {
    /** What is bought: "Knoblauch". */
    base: string;
    /** How it is prepared: "gehackt". */
    form: string;
    /** Anything else: "große Zehen". */
    note: string;
    optional: boolean;
}

/** Words for "can be left out". */
const OPTIONAL_PHRASE = /^(optional|opt\.?|nach wunsch|falls gewünscht|wer mag|if desired|if using|if you like|to serve, optional)$/i;

/*
 * Words that describe how an ingredient is prepared, or its size, when they
 * stand before it: "fein gehackte Zwiebeln", "thinly sliced red onion",
 * "2 große Eier". German ones by stem, so every ending is caught
 * ("frischer", "frische", "frisches").
 */
const FORM_STEMS = [
    'frisch', 'gehackt', 'gerieben', 'gewürfelt', 'gekocht', 'geschmolzen', 'weich', 'zerlassen', 'geschält', 'geschnitten', 'gehobelt',
    'halbiert', 'geviertelt', 'zerdrückt', 'gepresst', 'geraspelt', 'zerkleinert', 'entsteint', 'entkernt', 'reif', 'fein', 'grob', 'dünn',
];
const FORM_WORDS = new Set([
    'fresh', 'freshly', 'chopped', 'finely', 'grated', 'minced', 'sliced', 'thinly', 'diced', 'roughly', 'coarsely', 'cooked', 'melted',
    'softened', 'peeled', 'crushed', 'halved', 'quartered', 'shredded', 'pitted', 'seeded', 'ripe', 'cubed', 'julienned',
]);
/** Words that only say how the next word is done: moved only together with it. */
const ADVERBS = new Set(['frisch', 'fein', 'grob', 'dünn', 'freshly', 'finely', 'thinly', 'roughly', 'coarsely']);
const NOTE_STEMS = ['klein', 'groß', 'mittelgroß'];
const NOTE_WORDS = new Set(['small', 'large', 'medium', 'big', 'bio', 'organic', 'extra-large']);

/** "frischer" → "frisch", "Große" → "groß": a German stem with any ending; null when not one of them. */
function stemOf(word: string, stems: string[]): string | null {
    const lower = word.toLowerCase();
    for (const stem of stems) {
        if (lower === stem || (lower.startsWith(stem) && /^(e|er|es|en|em)$/.test(lower.slice(stem.length)))) return stem;
    }
    return null;
}

function kindOf(word: string): { kind: 'form' | 'note'; word: string } | null {
    const lower = word.toLowerCase();
    if (FORM_WORDS.has(lower)) return { kind: 'form', word: lower };
    if (NOTE_WORDS.has(lower)) return { kind: 'note', word: lower === 'bio' ? 'Bio' : lower };
    const form = stemOf(word, FORM_STEMS);
    if (form) return { kind: 'form', word: form };
    const note = stemOf(word, NOTE_STEMS);
    if (note) return { kind: 'note', word: note };
    return null;
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const joined = (parts: string[]) => [...new Set(parts.map(clean).filter(Boolean))].join(', ');

/**
 * Whether the words before a comma only describe what comes after it: German
 * ones all lower case while a noun (capitalised) follows, English ones
 * participles ("smoked", "salted") or known forms.
 */
function onlyAdjectives(head: string, rest: string): boolean {
    const words = head.split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 3) return false;
    // The first word may be capitalised as a line starts ("Fermentierte, gesalzene Garnelen"), if it reads as a participle.
    const german = /[A-ZÄÖÜ]/.test(rest) && words.every((word, index) => /^[a-zäöüß-]+$/.test(word) || (index === 0 && LEADING_PARTICIPLE.test(word)));
    const english = words.every((word) => /^[a-z-]+ed$/.test(word) || FORM_WORDS.has(word));
    return german || english;
}

/** "Fermentierte", "Gesalzene", "Marinierter": a participle, even capitalised at the start of a line. */
export const LEADING_PARTICIPLE = /^(?:Ge[a-zäöüß]+(?:t|en)|[A-ZÄÖÜ][a-zäöüß]+iert)(?:e|er|es|en|em)$/;

/** A name read into its parts. Headings ("## Für den Teig") and empty names come back as they are, in `base`. */
export function shapeOf(name: string): IngredientShape {
    let text = clean(name);
    const forms: string[] = [];
    const notes: string[] = [];
    let optional = false;
    if (!text || text.startsWith('#')) return { base: text, form: '', note: '', optional: false };

    // "optional: Chiliflocken", "Chiliflocken optional".
    text = text
        .replace(/^(optional|opt\.)\s*:?\s+/i, () => {
            optional = true;
            return '';
        })
        .replace(/\s+(optional|opt\.)$/i, () => {
            optional = true;
            return '';
        });

    // Brackets: "(optional)", "(große Zehen)", "(weich)".
    text = text.replace(/\(([^)]*)\)/g, (_, inner: string) => {
        for (const part of inner.split(/[,;]/).map(clean).filter(Boolean)) {
            if (OPTIONAL_PHRASE.test(part)) optional = true;
            else if (part.split(' ').every((word) => kindOf(word)?.kind === 'form')) forms.push(part.toLowerCase());
            else notes.push(part);
        }
        return ' ';
    });
    text = clean(text);

    // After the first comma: how it is prepared — or "optional".
    const parts = text.split(/[,;]/).map(clean).filter(Boolean);
    // "fermentierte, gesalzene Garnelen …", "smoked, salted bacon": a comma
    // between adjectives before the ingredient is not the one after it (work #49).
    let first = 1;
    while (first < parts.length && onlyAdjectives(parts.slice(0, first).join(' '), parts.slice(first).join(' '))) first += 1;
    let head = parts.slice(0, first).join(', ');
    const tail = parts.slice(first);
    const tailForms: string[] = [];
    for (const part of tail) {
        if (OPTIONAL_PHRASE.test(part)) optional = true;
        else tailForms.push(part);
    }

    // Before it: "fein gehackte", "thinly sliced", "2 große" — moved behind.
    const words = clean(head).split(' ');
    const leadForms: string[] = [];
    const leadNotes: string[] = [];
    while (words.length > 1) {
        const kind = kindOf(words[0]);
        if (!kind) break;
        // "frisch gemahlener Pfeffer": the "frisch" belongs to "gemahlener",
        // which is not moved, so neither is it.
        if (ADVERBS.has(words[0].toLowerCase()) && kindOf(words[1])?.kind !== 'form') break;
        (kind.kind === 'form' ? leadForms : leadNotes).push(kind.word);
        words.shift();
    }
    head = words.join(' ');

    return {
        base: head,
        form: joined([leadForms.join(' '), ...forms, ...tailForms]),
        note: joined([...leadNotes, ...notes]),
        optional,
    };
}

/** The parts written the one way: "Knoblauch, gehackt (große Zehen) (optional)". */
export function formatShape(shape: IngredientShape): string {
    if (!shape.base) return '';
    return `${capitalized(shape.base)}${shape.form ? `, ${shape.form}` : ''}${shape.note ? ` (${shape.note})` : ''}${shape.optional ? ' (optional)' : ''}`;
}

/** A name in the cookbook's way of writing it. Safe to run twice. */
export function conventional(name: string): string {
    const shape = shapeOf(name);
    return shape.base.startsWith('#') ? clean(name) : formatShape(shape) || clean(name);
}

/** Whether the dish can do without it. */
export function isOptional(name: string): boolean {
    return shapeOf(name).optional;
}

/** The rule as the AI is told it, for imports and translations. */
export const CONVENTION_RULE = `- "item" follows the cookbook's convention: "Ingredient, preparation (other notes) (optional)".
  The ingredient itself first, as it is bought; after a comma how it is prepared;
  sizes and other notes in brackets; "(optional)" last when the recipe says it can be left out.
  The ingredient starts with a capital letter in both languages.
  Examples: "Knoblauch, gehackt (große Zehen)", "Ingwer, frisch gerieben", "Chiliflocken (optional)",
  "Red onion, thinly sliced", "Eggs (large)", "Butter, softened".
  Every part but the first may be missing.`;

/** A recipe's rows with every ingredient written the convention's way; headings as they are. */
export function conventionalRows<T extends { amount: string; item: string }>(rows: T[]): T[] {
    return rows.map((row) => (sectionHeading(row) !== null ? row : { ...row, item: conventional(row.item) }));
}

/**
 * Whether the rules cannot vouch for a name being written the convention's
 * way, so it is worth one look by the AI: a long ingredient, one with a
 * comma or a "mit"/"with" in it, or one with lower-case words before its
 * noun ("Fermentierte gesalzene Garnelen").
 */
export function needsReading(name: string): boolean {
    const shape = shapeOf(name);
    const base = shape.base;
    if (!base || base.startsWith('#')) return false;
    const count = base.split(' ').filter(Boolean).length;
    if (base.includes(',') || count > 3) return true;
    if (/\b(mit|with|von|aus|from|in)\b/i.test(base)) return true;
    return /^\S+\s+[a-zäöüß]/.test(base) && /\s[A-ZÄÖÜ]/.test(base);
}
