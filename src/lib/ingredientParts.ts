import { parseQuantity, formatQuantity } from './amount';
import type { Ingredient } from './recipe';

/**
 * Splits a free-text amount into the parts a database can work with.
 *
 * The raw string is always stored alongside, so a line this parser reads
 * differently than intended still displays exactly as the author typed it.
 * Structure buys scaling and searching by ingredient; it never costs wording.
 */

export interface AmountParts {
    quantity: number | null;
    quantityMax: number | null;
    unit: string | null;
}

export interface StructuredIngredient extends AmountParts {
    name: string;
    raw: string;
    /** The heading it is listed under, or null. See `sectionHeading`. */
    section?: string | null;
}

/**
 * A row of the ingredient editor that is a heading rather than an
 * ingredient: no amount, and a name written "## Für den Teig" — which is what
 * the editor's "+ Section" button inserts — or "Für den Teig:", which is how
 * recipes write it and what a paste brings in. Returns the heading, or null.
 */
export function sectionHeading(row: { amount: string; item: string }): string | null {
    if (row.amount.trim() !== '') return null;
    const item = row.item.trim();
    const marked = /^#{1,3}\s*(.+)$/.exec(item);
    if (marked) return marked[1].trim().replace(/:$/, '') || null;
    const colon = /^(.{2,60}):$/.exec(item);
    return colon ? colon[1].trim() : null;
}

/** The editor's rows again, with a heading row wherever the section changes. */
export function withHeadingRows(rows: { amount: string; item: string; section?: string | null }[]): Ingredient[] {
    const out: Ingredient[] = [];
    let current: string | null = null;
    for (const row of rows) {
        const section = row.section ?? null;
        if (section !== current && section) out.push({ amount: '', item: `## ${section}` });
        current = section;
        out.push({ amount: row.amount, item: row.item });
    }
    return out;
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s+\d+\s*\/\s*\d+)?`;
const RANGE = String.raw`\s*(?:-|–|—|bis|to)\s*`;

const AMOUNT_PATTERN = new RegExp(
    `^\\s*(?:ca\\.?|etwa|approx\\.?|about)?\\s*(${NUMBER})(?:${RANGE}(${NUMBER}))?\\s*(.*)$`,
    'i'
);

const VULGAR: Record<string, string> = {
    '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
    '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
    '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

function normalise(text: string): string {
    let result = text;
    for (const [glyph, ascii] of Object.entries(VULGAR)) {
        // "1½" is one and a half, not "11/2": a space goes between.
        result = result.replace(new RegExp(`(\\d)?${glyph}`, 'g'), (_, digit) => (digit ? `${digit} ${ascii}` : ascii));
    }
    return result.trim();
}

export function splitAmount(amount: string): AmountParts {
    const text = normalise(amount ?? '');
    if (!text) return { quantity: null, quantityMax: null, unit: null };

    const match = AMOUNT_PATTERN.exec(text);

    if (!match) {
        // No leading number: the whole thing is a unit-ish word ("Prise",
        // "etwas"). Keep it as the unit so it survives a round trip.
        return { quantity: null, quantityMax: null, unit: text };
    }

    const [, first, second, rest] = match;
    const quantity = parseQuantity(first);

    if (quantity === null) return { quantity: null, quantityMax: null, unit: text };

    const unit = rest.trim().replace(/\.$/, '');

    return {
        quantity,
        quantityMax: second ? parseQuantity(second) : null,
        unit: unit || null,
    };
}

/** Rebuilds a display string from the parts, optionally scaled. */
export function formatAmount(parts: AmountParts, factor = 1): string {
    const { quantity, quantityMax, unit } = parts;

    if (quantity === null) return unit ?? '';

    const scaled = formatQuantity(quantity * factor);
    const range = quantityMax !== null ? `-${formatQuantity(quantityMax * factor)}` : '';

    return unit ? `${scaled}${range} ${unit}` : `${scaled}${range}`;
}

/** Turns the form's {amount, item} pairs into rows ready for the database. */
export function toStructuredIngredients(ingredients: Ingredient[]): StructuredIngredient[] {
    let section: string | null = null;
    const rows: StructuredIngredient[] = [];

    for (const ingredient of ingredients) {
        const heading = sectionHeading(ingredient);
        if (heading !== null) {
            section = heading;
            continue;
        }

        const name = ingredient.item.trim();
        // Empty, or a heading that was added and never named.
        if (name === '' || (/^#+$/.test(name) && ingredient.amount.trim() === '')) continue;

        rows.push({
            ...splitAmount(ingredient.amount),
            name,
            raw: ingredient.amount.trim(),
            section,
        });
    }

    return rows;
}

export function toDisplayIngredient(
    row: StructuredIngredient,
    factor = 1
): Ingredient {
    const amount =
        factor === 1 && row.raw ? row.raw : formatAmount(row, factor) || row.raw;

    return { amount, item: row.name };
}
