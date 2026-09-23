import { Ingredient } from './recipe';

/**
 * Rule-based recipe parsing. No AI, no network, no cost — this is the default
 * path for getting a recipe into the form quickly, and it has to keep working
 * when no API key is configured.
 */

export interface ParsedRecipe {
    title: string;
    description: string;
    ingredients: Ingredient[];
    instructions: string;
}

const UNITS = [
    // German
    'g', 'gr', 'gramm', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'liter',
    'el', 'esslöffel', 'essloeffel', 'tl', 'teelöffel', 'teeloeffel',
    'prise', 'prisen', 'msp', 'messerspitze', 'pck', 'packung', 'packungen',
    'päckchen', 'paeckchen', 'dose', 'dosen', 'glas', 'gläser', 'glaeser',
    'stück', 'stueck', 'stk', 'bund', 'zehe', 'zehen', 'scheibe', 'scheiben',
    'tasse', 'tassen', 'becher', 'blatt', 'blätter', 'blaetter', 'kugel', 'kugeln',
    'tropfen', 'spritzer', 'handvoll', 'portion', 'portionen', 'zweig', 'zweige',
    'stange', 'stangen', 'knolle', 'knollen', 'kopf', 'köpfe', 'koepfe',
    // English
    'kilogram', 'kilograms', 'gram', 'grams', 'ounce', 'ounces', 'oz',
    'pound', 'pounds', 'lb', 'lbs', 'cup', 'cups', 'tablespoon', 'tablespoons',
    'tbsp', 'teaspoon', 'teaspoons', 'tsp', 'pinch', 'pinches', 'clove', 'cloves',
    'slice', 'slices', 'can', 'cans', 'package', 'packages', 'bunch', 'bunches',
    'piece', 'pieces', 'handful', 'stick', 'sticks', 'quart', 'pint', 'gallon',
    'milliliter', 'milliliters', 'liters', 'litre', 'litres',
];

/** Words that act as a quantity all by themselves ("etwas Öl", "Salz nach Geschmack"). */
const STANDALONE_QUANTIFIERS = [
    'etwas', 'wenig', 'viel', 'reichlich', 'nach geschmack', 'nach belieben',
    'a little', 'some', 'to taste',
];

const UNIT_PATTERN = UNITS.slice().sort((a, b) => b.length - a.length).join('|');

const VULGAR_FRACTIONS: Record<string, string> = {
    '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
    '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
    '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

const INGREDIENT_HEADINGS = [
    'zutaten', 'ingredients', 'du brauchst', 'you will need', 'einkaufsliste',
    'zutatenliste', 'für den teig', 'für die sauce', 'für die soße',
];

const INSTRUCTION_HEADINGS = [
    'zubereitung', 'anleitung', 'zubereitungsschritte', 'schritte', 'so gehts',
    "so geht's", 'instructions', 'method', 'directions', 'steps', 'preparation',
];

const NOTE_HEADINGS = ['tipp', 'tipps', 'hinweis', 'notes', 'note', 'tip', 'tips'];

function normalise(text: string): string {
    let result = text.replace(/\r\n?/g, '\n');
    for (const [glyph, ascii] of Object.entries(VULGAR_FRACTIONS)) {
        result = result.replaceAll(glyph, ascii);
    }
    return result;
}

function stripBullet(line: string): string {
    return line.replace(/^\s*(?:[-–—•*·▪]|\d+[.)])\s+/, '').trim();
}

function headingKind(line: string): 'ingredients' | 'instructions' | 'notes' | null {
    const cleaned = line
        .toLowerCase()
        .replace(/^#+\s*/, '')
        .replace(/[:：]\s*$/, '')
        .replace(/^\*+|\*+$/g, '')
        .trim();

    if (cleaned.length > 40) return null;
    if (INGREDIENT_HEADINGS.some((heading) => cleaned === heading || cleaned.startsWith(heading))) {
        return 'ingredients';
    }
    if (INSTRUCTION_HEADINGS.some((heading) => cleaned === heading || cleaned.startsWith(heading))) {
        return 'instructions';
    }
    if (NOTE_HEADINGS.some((heading) => cleaned === heading)) return 'notes';
    return null;
}

/**
 * "200 g Mehl" -> { amount: "200 g", item: "Mehl" }
 * "2-3 EL Olivenöl" -> { amount: "2-3 EL", item: "Olivenöl" }
 * "Salz" -> { amount: "", item: "Salz" }
 */
export function parseIngredientLine(rawLine: string): Ingredient {
    const line = stripBullet(normalise(rawLine));
    if (!line) return { amount: '', item: '' };

    // Quantity: optional approximation word, a number (decimal, fraction, mixed
    // or range), then an optional unit.
    const quantity = new RegExp(
        String.raw`^(?:(?:ca\.?|etwa|approx\.?|about)\s+)?` +
        String.raw`(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s+\d+\s*\/\s*\d+)?` +
        String.raw`(?:\s*(?:-|–|—|bis|to)\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)?)` +
        String.raw`\s*(${UNIT_PATTERN})?\.?\b\s*(.*)$`,
        'i'
    );

    const match = quantity.exec(line);
    if (match) {
        const [, number, unit, rest] = match;
        const amount = unit ? `${number.trim()} ${unit}` : number.trim();
        const item = rest
            .trim()
            .replace(/^[-–—:,]\s*/, '')
            // "4 slices of bread" -> "bread"
            .replace(/^(?:of|von)\s+/i, '');
        // "2 Eier" is a quantity; "2019 was a good year" is not a useful split,
        // but an empty remainder means the line was only a number, so keep it whole.
        if (item) return { amount, item };
        return { amount: '', item: line };
    }

    // Unit without a number: "Prise Salz", "handful of parsley"
    const bareUnit = new RegExp(String.raw`^(${UNIT_PATTERN})\s+(?:of\s+)?(.+)$`, 'i');
    const bareMatch = bareUnit.exec(line);
    if (bareMatch) {
        return { amount: bareMatch[1], item: bareMatch[2].trim() };
    }

    for (const quantifier of STANDALONE_QUANTIFIERS) {
        if (line.toLowerCase().startsWith(quantifier + ' ')) {
            return {
                amount: line.slice(0, quantifier.length),
                item: line.slice(quantifier.length).trim(),
            };
        }
    }

    return { amount: '', item: line };
}

/** Does this line look like part of an ingredient list rather than a sentence? */
function looksLikeIngredient(rawLine: string): boolean {
    const line = stripBullet(rawLine);
    if (!line) return false;
    // Real instructions are sentences; ingredient lines are short and rarely
    // end in a full stop.
    if (line.length > 80) return false;
    if (/[.!?]$/.test(line) && line.split(/\s+/).length > 6) return false;

    const hasLeadingNumber = /^(?:ca\.?|etwa|approx\.?|about)?\s*\d/.test(line);
    const hasUnit = new RegExp(String.raw`\b(${UNIT_PATTERN})\b\.?`, 'i').test(line);

    return hasLeadingNumber || hasUnit;
}

export function toMarkdownSteps(lines: string[]): string {
    const steps: string[] = [];
    let current = '';

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            if (current) {
                steps.push(current.trim());
                current = '';
            }
            continue;
        }

        // A new numbered or bulleted line always starts a new step.
        if (/^\s*(?:\d+[.)]|[-–—•*])\s+/.test(line)) {
            if (current) steps.push(current.trim());
            current = stripBullet(line);
        } else if (current) {
            current += ' ' + trimmed;
        } else {
            current = trimmed;
        }
    }

    if (current) steps.push(current.trim());

    const meaningful = steps.filter((step) => step.length > 0);
    if (meaningful.length === 0) return '';
    if (meaningful.length === 1) return meaningful[0];

    return meaningful.map((step, index) => `${index + 1}. ${step}`).join('\n\n');
}

/**
 * Turns a pasted recipe into form fields. Handles the two common shapes:
 * explicit "Zutaten"/"Zubereitung" headings, and a bare list of ingredients
 * followed by prose.
 */
export function parseRecipeText(input: string): ParsedRecipe {
    const text = normalise(input).trim();

    const empty: ParsedRecipe = { title: '', description: '', ingredients: [], instructions: '' };
    if (!text) return empty;

    const lines = text.split('\n');

    let title = '';
    const ingredientLines: string[] = [];
    const instructionLines: string[] = [];
    const preambleLines: string[] = [];

    let section: 'preamble' | 'ingredients' | 'instructions' | 'notes' = 'preamble';
    let sawHeading = false;

    for (const line of lines) {
        const kind = headingKind(line);

        if (kind) {
            sawHeading = true;
            section = kind;
            continue;
        }

        if (!line.trim()) {
            if (section === 'instructions') instructionLines.push('');
            continue;
        }

        if (section === 'ingredients') {
            ingredientLines.push(line);
        } else if (section === 'instructions' || section === 'notes') {
            instructionLines.push(line);
        } else {
            preambleLines.push(line);
        }
    }

    // The first preamble line is the title; markdown headings count too.
    if (preambleLines.length > 0) {
        title = preambleLines[0].replace(/^#+\s*/, '').replace(/^\*+|\*+$/g, '').trim();
    }

    let description = '';

    if (!sawHeading) {
        // No headings: split the body by shape. Ingredient-looking lines come
        // first, everything after the last one is the method.
        const body = preambleLines.slice(1);
        let lastIngredientIndex = -1;

        for (let index = 0; index < body.length; index++) {
            if (looksLikeIngredient(body[index])) lastIngredientIndex = index;
        }

        if (lastIngredientIndex >= 0) {
            for (let index = 0; index <= lastIngredientIndex; index++) {
                if (looksLikeIngredient(body[index])) ingredientLines.push(body[index]);
                else if (index === 0) description = body[index].trim();
            }
            instructionLines.push(...body.slice(lastIngredientIndex + 1));
        } else {
            instructionLines.push(...body);
        }
    } else {
        // Anything between the title and the first heading is the intro text.
        description = preambleLines.slice(1).join(' ').trim();
    }

    const ingredients = ingredientLines
        .map(parseIngredientLine)
        .filter((ingredient) => ingredient.item.trim() !== '');

    return {
        title,
        description,
        ingredients,
        instructions: toMarkdownSteps(instructionLines),
    };
}
