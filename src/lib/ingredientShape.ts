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
  Every part but the first may be missing.
  Where another ingredient will do, it follows with "oder"/"or": "Rinderfilet oder Hüfte, fein gehackt" — the
  preparation after the last applies to all; one with its own amount writes it before it ("oder 400 g Hüfte").
  What an ingredient is ("Gochugaru (Korean chili flakes)", "Mirin, japanischer Reiswein") is not part of it:
  leave such an explanation out — the cookbook explains its ingredients itself, beside them.`;

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

/**
 * A name read strictly by its syntax, for the form's fields — nothing moved,
 * nothing tidied, spaces as typed: what is before the first comma is the
 * ingredient, after it the preparation, in brackets the notes, and
 * "(optional)" the checkbox. `joinParts` writes them back, so a field typed
 * into comes back the same on the next render.
 */
export function partsOf(name: string): IngredientShape {
    if (name.trimStart().startsWith('#')) return { base: name, form: '', note: '', optional: false };
    let optional = false;
    const notes: string[] = [];
    // Each bracket with what is inside, brackets in it too ("(in Dose (400 g))").
    let text = '';
    let depth = 0;
    let inner = '';
    for (const char of name) {
        if (char === '(') {
            if (depth > 0) inner += char;
            else text = text.replace(/ $/, '');
            depth += 1;
        } else if (char === ')' && depth > 0) {
            depth -= 1;
            if (depth > 0) inner += char;
            else {
                // Only "(optional)" itself is the checkbox: a note being typed ("opt…", "wer mag") stays a note.
                if (inner.trim().toLowerCase() === 'optional') optional = true;
                else notes.push(inner);
                inner = '';
            }
        } else if (depth > 0) inner += char;
        else text += char;
    }
    if (depth > 0) notes.push(inner);
    const comma = text.indexOf(',');
    return {
        base: comma === -1 ? text : text.slice(0, comma),
        form: comma === -1 ? '' : text.slice(comma + 1).replace(/^ /, ''),
        note: notes.join(', '),
        optional,
    };
}

/** The form's fields written as one name: "Knoblauch, gehackt (große Zehen) (optional)". Brackets typed into a field are dropped. */
export function joinParts(parts: IngredientShape): string {
    const bare = (text: string) => text.replace(/[()]/g, '');
    const base = bare(parts.base);
    const form = bare(parts.form);
    // Brackets inside a note are kept when they pair up ("in Dose (400 g)").
    const note = (parts.note.match(/\(/g) ?? []).length === (parts.note.match(/\)/g) ?? []).length ? parts.note : bare(parts.note);
    const head = base.trim() ? base.charAt(0).toLocaleUpperCase('de') + base.slice(1) : base;
    return `${head}${form ? `, ${form}` : ''}${note ? ` (${note})` : ''}${parts.optional ? ' (optional)' : ''}`;
}

/**
 * The ingredient field typed into: a comma or a bracket there starts the
 * next part ("Knoblauch, gehackt" → ingredient "Knoblauch", preparation
 * "gehackt"), so the one way of writing is kept whatever is typed.
 */
export function withBase(parts: IngredientShape, typed: string): IngredientShape {
    if (!/[,(]/.test(typed)) return { ...parts, base: typed };
    const read = partsOf(typed.replace(/\(([^)]*)$/, '($1)'));
    return {
        base: read.base,
        form: [read.form, parts.form].filter((part) => part.trim()).join(', '),
        note: [read.note, parts.note].filter((part) => part.trim()).join(', '),
        optional: parts.optional || read.optional,
    };
}

/** One "oder …" of a row: its own ingredient, and only what differs from the row's — empty is "as above". */
export interface Alternative {
    /** Its own amount ("400 g"), or '' for the row's. */
    amount: string;
    base: string;
    form: string;
    note: string;
}

/** A row read as its ingredient and the ones that may stand in for it. */
export interface RowAlternatives {
    /** The row without its alternatives: "Rinderfilet, fein gehackt (optional)". */
    main: string;
    alternatives: Alternative[];
}

/** "oder"/"or" between two ingredients, outside brackets; also one at the very end, while the next is still being typed. */
const OR_WORD = /\s+(?:oder|or)(?=\s+|$)\s*/gi;
const OPTIONAL_END = /\s*\(optional\)\s*$/i;

/** An alternative's own amount at its start: "400 g Hüfte", "2 Hüftsteaks". */
function altAmount(part: string): { amount: string; rest: string } {
    const match = /^((?:ca\.\s*)?\d+(?:[.,/]\d+)?(?:\s*[-–]\s*\d+(?:[.,/]\d+)?)?)\s+(\S+)(?:\s+(.*))?$/.exec(part.trim());
    if (!match) return { amount: '', rest: part };
    const [, number, word, rest] = match;
    // "400 g Hüfte": a unit word after the number; "2 Hüftsteaks": none, the number alone.
    if (rest && /^(?:g|kg|mg|ml|l|cl|dl|el|tl|tbsp|tsp|prise|pinch|zehe|zehen|clove|cloves|bund|bunch|stück|stk\.?|scheibe|scheiben|slice|slices|dose|dosen|can|cans|cup|cups|tasse|tassen|oz|lb|cm)$/i.test(word)) {
        return { amount: `${number} ${word}`, rest };
    }
    return { amount: number, rest: rest ? `${word} ${rest}` : word };
}

/**
 * A row's ingredient and its alternatives: "Rinderfilet oder Hüfte, fein
 * gehackt" is Rinderfilet, or Hüfte as the same; "Rinderfilet, fein gehackt
 * oder 400 g Hüfte, in Würfeln" gives Hüfte its own amount and preparation.
 * "(optional)" at the end is the whole row's. A heading has none.
 */
export function alternativesOf(item: string): RowAlternatives {
    if (item.trimStart().startsWith('#')) return { main: item, alternatives: [] };
    const optional = OPTIONAL_END.test(item);
    const text = optional ? item.replace(OPTIONAL_END, '') : item;
    const cuts: { at: number; end: number }[] = [];
    for (const match of text.matchAll(OR_WORD)) {
        const before = text.slice(0, match.index);
        // Only outside brackets: "(Hüfte oder Filet)" is a note.
        if ((before.match(/\(/g) ?? []).length === (before.match(/\)/g) ?? []).length) cuts.push({ at: match.index!, end: match.index! + match[0].length });
    }
    if (cuts.length === 0) return { main: item, alternatives: [] };
    const parts = cuts.map((cut, index) => text.slice(cut.end, cuts[index + 1]?.at ?? text.length));
    let main = text.slice(0, cuts[0].at);
    const alternatives = parts.map((part) => {
        const { amount, rest } = altAmount(part);
        const shape = partsOf(rest);
        return { amount, base: shape.base, form: shape.form, note: shape.note };
    });
    // "Rinderfilet oder Hüfte, fein gehackt": a preparation after the last one, with none before it, is the whole row's.
    const own = partsOf(main);
    const last = alternatives[alternatives.length - 1];
    if (!own.form && !own.note && (last.form || last.note) && alternatives.slice(0, -1).every((alternative) => !alternative.form && !alternative.note && !alternative.amount)) {
        main = joinParts({ ...own, form: last.form, note: last.note });
        alternatives[alternatives.length - 1] = { ...last, form: '', note: '' };
    }
    return { main: optional ? `${main} (optional)` : main, alternatives };
}

/** The row written again from its ingredient and alternatives, in the row's language ("oder"/"or"); "(optional)" last. */
export function withAlternatives(main: string, alternatives: Alternative[], language: 'de' | 'en'): string {
    if (alternatives.length === 0) return main;
    const shape = partsOf(main);
    const word = language === 'en' ? 'or' : 'oder';
    const rest = alternatives.map((alternative) => [alternative.amount.trim(), joinParts({ base: alternative.base, form: alternative.form, note: alternative.note, optional: false })].filter(Boolean).join(' '));
    // None of them with its own: the row's preparation and notes after the last, for all of them ("Rinderfilet oder Hüfte, fein gehackt").
    const shared = alternatives.every((alternative) => !alternative.form && !alternative.note && !alternative.amount);
    const head = joinParts({ ...shape, ...(shared ? { form: '', note: '' } : {}), optional: false });
    const tail = shared ? joinParts({ base: '', form: shape.form, note: shape.note, optional: false }) : '';
    return `${[head, ...rest].join(` ${word} `)}${tail}${shape.optional ? ' (optional)' : ''}`;
}

/** The row with only the alternatives that name something: what is saved. */
export function withoutEmptyAlternatives(item: string, language: 'de' | 'en'): string {
    const read = alternativesOf(item);
    if (read.alternatives.length === 0) return item;
    return withAlternatives(read.main, read.alternatives.filter((alternative) => alternative.base.trim()), language);
}

/** The shape of a row's own ingredient, its alternatives left out: what a rename or a match looks at. */
export function mainShape(item: string): IngredientShape {
    return shapeOf(alternativesOf(item).main);
}

/** The row with its ingredient renamed ("Nudeln" → "Pasta"), its preparation, notes and alternatives kept — in the row's own "oder"/"or". */
export function renamedMain(item: string, base: string): string {
    const read = alternativesOf(item);
    const language = /\s+or(?:\s|$)/i.test(item) && !/\s+oder(?:\s|$)/i.test(item) ? 'en' : 'de';
    return withAlternatives(formatShape({ ...shapeOf(read.main), base }), read.alternatives, language);
}
