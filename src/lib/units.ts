import type { AmountParts } from './ingredientParts';

/**
 * Units: what they are, what they are in grams or millilitres, and how they
 * are written.
 *
 * Recipes arrive from everywhere — German blogs in EL and TL, American ones in
 * cups and ounces, British ones in grams and pints — and the ingredient rows
 * keep the unit exactly as it was written, which is right for storage and
 * wrong for cooking in a European kitchen with a scale and a measuring jug.
 * This module knows the units well enough to:
 *
 * - show an American recipe in grams and millilitres (`toMetric`), a cup of
 *   flour as its weight rather than its volume where the ingredient is known;
 * - tidy an amount after scaling (1000 g → 1 kg, 0.25 l → 250 ml);
 * - say which amounts can be added up, so the shopping list can turn "200 g
 *   Mehl" and "0.5 kg Mehl" into "700 g Mehl" (`toBase`, `fromBase`).
 *
 * EL, TL and a pinch are left alone. They are European units, every kitchen
 * has the spoons, and "15 ml Olivenöl" is a worse instruction than "1 EL".
 */

export type Dimension = 'mass' | 'volume' | 'spoon' | 'count';

interface UnitDef {
    id: string;
    dimension: Dimension;
    /** In grams for mass, millilitres for volume and spoons, 1 for a count. */
    base: number;
    metric: boolean;
    aliases: string[];
    label: { en: string; de: string };
}

const UNITS: UnitDef[] = [
    { id: 'mg', dimension: 'mass', base: 0.001, metric: true, aliases: ['mg', 'milligramm', 'milligram', 'milligrams'], label: { en: 'mg', de: 'mg' } },
    { id: 'g', dimension: 'mass', base: 1, metric: true, aliases: ['g', 'gr', 'gramm', 'gram', 'grams', 'gramme', 'grammes'], label: { en: 'g', de: 'g' } },
    { id: 'kg', dimension: 'mass', base: 1000, metric: true, aliases: ['kg', 'kilo', 'kilogramm', 'kilogram', 'kilograms', 'kilos'], label: { en: 'kg', de: 'kg' } },
    { id: 'oz', dimension: 'mass', base: 28.35, metric: false, aliases: ['oz', 'ounce', 'ounces', 'unze', 'unzen'], label: { en: 'oz', de: 'oz' } },
    { id: 'lb', dimension: 'mass', base: 453.6, metric: false, aliases: ['lb', 'lbs', 'pound', 'pounds'], label: { en: 'lb', de: 'lb' } },
    // A German pound is half a kilo, and a German recipe that says Pfund means that.
    { id: 'pfund', dimension: 'mass', base: 500, metric: true, aliases: ['pfund', 'pfd'], label: { en: 'Pfund', de: 'Pfund' } },

    { id: 'ml', dimension: 'volume', base: 1, metric: true, aliases: ['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres'], label: { en: 'ml', de: 'ml' } },
    { id: 'cl', dimension: 'volume', base: 10, metric: true, aliases: ['cl', 'zentiliter', 'centiliter', 'centilitre'], label: { en: 'cl', de: 'cl' } },
    { id: 'dl', dimension: 'volume', base: 100, metric: true, aliases: ['dl', 'deziliter', 'deciliter', 'decilitre'], label: { en: 'dl', de: 'dl' } },
    { id: 'l', dimension: 'volume', base: 1000, metric: true, aliases: ['l', 'ltr', 'liter', 'litre', 'liters', 'litres'], label: { en: 'l', de: 'l' } },
    { id: 'cup', dimension: 'volume', base: 240, metric: false, aliases: ['cup', 'cups', 'c', 'tasse', 'tassen', 'cup(s)'], label: { en: 'cup', de: 'Tasse' } },
    { id: 'floz', dimension: 'volume', base: 29.57, metric: false, aliases: ['fl oz', 'fl. oz', 'floz', 'fluid ounce', 'fluid ounces'], label: { en: 'fl oz', de: 'fl oz' } },
    { id: 'pint', dimension: 'volume', base: 473, metric: false, aliases: ['pint', 'pints', 'pt'], label: { en: 'pint', de: 'Pint' } },
    { id: 'quart', dimension: 'volume', base: 946, metric: false, aliases: ['quart', 'quarts', 'qt'], label: { en: 'quart', de: 'Quart' } },

    { id: 'tsp', dimension: 'spoon', base: 5, metric: true, aliases: ['tl', 'teelöffel', 'teeloeffel', 'tsp', 'teaspoon', 'teaspoons', 'tsp.'], label: { en: 'tsp', de: 'TL' } },
    { id: 'tbsp', dimension: 'spoon', base: 15, metric: true, aliases: ['el', 'esslöffel', 'essloeffel', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'tbl'], label: { en: 'tbsp', de: 'EL' } },
];

/**
 * Grams in one US cup, for the dry things a cup is used to measure. Found by
 * a word in the ingredient's name, English or German. What is not here is
 * shown in millilitres, which is still something a jug can measure.
 */
const GRAMS_PER_CUP: Array<[RegExp, number]> = [
    [/powdered sugar|icing sugar|puderzucker/i, 120],
    [/brown sugar|brauner zucker|rohrzucker/i, 220],
    [/sugar|zucker/i, 200],
    [/flour|mehl/i, 125],
    [/butter(?!milch|milk)/i, 227],
    [/cocoa|kakao/i, 85],
    [/oats|haferflocken/i, 90],
    [/\brice\b(?!\s*(vinegar|wine))|reis(?!essig|wein|mehl|elbeer)/i, 185],
    [/honey|honig|syrup|sirup/i, 340],
    [/cheese|käse|parmesan/i, 100],
    [/almonds|mandeln|walnuts|walnüsse|nuts|nüsse|pecans/i, 120],
    [/chocolate chips|schokostückchen|schokotropfen/i, 170],
    [/breadcrumbs|semmelbrösel|paniermehl/i, 110],
];

const BY_ALIAS = new Map<string, UnitDef>();
for (const unit of UNITS) for (const alias of unit.aliases) BY_ALIAS.set(alias, unit);

/** The unit a written unit means, or null for "Stück", "Zehe", a word we do not know. */
export function unitOf(written: string | null | undefined): UnitDef | null {
    if (!written) return null;
    const key = written.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
    return BY_ALIAS.get(key) ?? null;
}

export type UnitSystem = 'metric' | 'original';
type Locale = 'en' | 'de';

/** A number, rounded the way a kitchen would say it. */
function kitchenRound(value: number, unit: string): number {
    if (unit === 'g' || unit === 'ml') {
        if (value >= 100) return Math.round(value / 5) * 5;
        if (value >= 10) return Math.round(value);
        return Math.round(value * 10) / 10;
    }
    return Math.round(value * 100) / 100;
}

/** 1000 g → 1 kg, 0.25 kg → 250 g, 1500 ml → 1.5 l, 6 TL → 2 EL. */
export function tidy(parts: AmountParts, locale: Locale = 'de'): AmountParts {
    const unit = unitOf(parts.unit);
    if (!unit || parts.quantity === null) return parts;

    const top = parts.quantityMax ?? parts.quantity;
    const inBase = (value: number | null) => (value === null ? null : value * unit.base);

    const express = (target: UnitDef): AmountParts => ({
        quantity: kitchenRound(inBase(parts.quantity)! / target.base, target.id),
        quantityMax: parts.quantityMax === null ? null : kitchenRound(inBase(parts.quantityMax)! / target.base, target.id),
        unit: target.label[locale],
    });

    const def = (id: string) => UNITS.find((candidate) => candidate.id === id)!;

    if (unit.dimension === 'mass' && unit.metric) {
        return express(top * unit.base >= 1000 ? def('kg') : def('g'));
    }
    if (unit.dimension === 'volume' && unit.metric) {
        return express(top * unit.base >= 1000 ? def('l') : def('ml'));
    }
    // Three teaspoons are a tablespoon, but only when it comes out even.
    if (unit.id === 'tsp' && parts.quantity >= 3 && Number.isInteger(parts.quantity / 3) && parts.quantityMax === null) {
        return { quantity: parts.quantity / 3, quantityMax: null, unit: def('tbsp').label[locale] };
    }
    // Spoons in the page's abbreviation (EL/tbsp say the same for one or
    // three); anything else as it was written: the label is singular, and
    // "2 1/4 Tasse" replaced a correct "2 1/4 cups".
    if (unit.id === 'tbsp' || unit.id === 'tsp') return { ...parts, unit: unit.label[locale] };
    return parts;
}

/**
 * The amount in European units: cups, ounces, pounds, pints into grams and
 * millilitres. Metric amounts and spoons come back tidied and otherwise as
 * they were; anything else ("2 Zehen", "1 Dose") untouched.
 */
export function toMetric(parts: AmountParts, ingredient: string, locale: Locale = 'de'): AmountParts {
    const unit = unitOf(parts.unit);
    if (!unit || parts.quantity === null) return parts;
    if (unit.metric) return tidy(parts, locale);

    const perCup = unit.id === 'cup' ? GRAMS_PER_CUP.find(([pattern]) => pattern.test(ingredient))?.[1] : undefined;

    const convert = (value: number | null) => {
        if (value === null) return null;
        if (perCup !== undefined) return value * perCup;
        return value * unit.base;
    };

    const asGrams = unit.dimension === 'mass' || perCup !== undefined;
    return tidy(
        { quantity: convert(parts.quantity), quantityMax: convert(parts.quantityMax), unit: asGrams ? 'g' : 'ml' },
        locale
    );
}

/** What the shopping list adds up: a dimension and an amount in its base, or a named unit. */
export interface Measured {
    /** 'mass' in g, 'volume' in ml, 'spoon' in ml, or `count:<unit>` for named units. */
    key: string;
    amount: number;
}

/**
 * Named units in both numbers, so "1 Zehe" and "2 Zehen" are one line on the
 * shopping list: the key holds the singular, and `fromBase` writes whichever
 * the amount asks for.
 */
const COUNT_UNITS: Array<[singular: string, plural: string]> = [
    ['zehe', 'zehen'], ['dose', 'dosen'], ['scheibe', 'scheiben'], ['packung', 'packungen'],
    ['stange', 'stangen'], ['tasse', 'tassen'], ['flasche', 'flaschen'], ['knolle', 'knollen'],
    ['prise', 'prisen'], ['becher', 'becher'], ['glas', 'gläser'], ['stück', 'stück'], ['bund', 'bund'], ['handvoll', 'handvoll'], ['zweig', 'zweige'], ['blatt', 'blätter'],
    ['clove', 'cloves'], ['can', 'cans'], ['slice', 'slices'], ['pinch', 'pinches'], ['bunch', 'bunches'],
];
const ENGLISH_COUNT_UNITS = new Set(['clove', 'can', 'slice', 'pinch', 'bunch']);
const COUNT_ALIASES: Record<string, string> = { stk: 'stück', 'stk.': 'stück', pck: 'packung', 'pck.': 'packung', päckchen: 'packung' };

/** A word that is a unit of its own ("Zehe", "Dosen", "Stk"), not part of the name. */
export function isCountUnit(word: string): boolean {
    const lower = word.trim().toLowerCase();
    const aliased = COUNT_ALIASES[lower] ?? lower;
    return COUNT_UNITS.some(([one, many]) => aliased === one || aliased === many);
}

function countUnitKey(unit: string): string {
    const lower = unit.trim().toLowerCase();
    const aliased = COUNT_ALIASES[lower] ?? lower;
    return COUNT_UNITS.find(([one, many]) => aliased === one || aliased === many)?.[0] ?? aliased;
}

function countUnitFor(key: string, amount: number): string {
    const pair = COUNT_UNITS.find(([one]) => one === key);
    if (!pair) return key;
    const word = amount > 1 ? pair[1] : pair[0];
    // German nouns are capitalised; the English ones are not.
    return ENGLISH_COUNT_UNITS.has(key) ? word : word[0].toUpperCase() + word.slice(1);
}

export function toBase(parts: AmountParts, ingredient: string): Measured | null {
    if (parts.quantity === null) return null;
    const value = parts.quantityMax ?? parts.quantity;
    const unit = unitOf(parts.unit);

    if (!unit) return { key: `count:${countUnitKey(parts.unit ?? '')}`, amount: value };

    const metric = toMetric({ quantity: value, quantityMax: null, unit: parts.unit }, ingredient, 'en');
    const metricUnit = unitOf(metric.unit);
    if (!metricUnit || metric.quantity === null) return null;

    if (metricUnit.dimension === 'mass') return { key: 'mass', amount: metric.quantity * metricUnit.base };
    // Spoons add up among themselves, and stay spoons: "4 EL" on a shopping
    // list, not "60 ml".
    // Butter is bought by weight, not by the spoon: a tablespoon is about
    // 14 g, and "85 g Butter" is what the packet says.
    if (metricUnit.dimension === 'spoon' && /butter/i.test(ingredient)) {
        return { key: 'mass', amount: ((metric.quantity * metricUnit.base) / 15) * 14 };
    }
    if (metricUnit.dimension === 'spoon') return { key: 'spoon', amount: metric.quantity * metricUnit.base };
    return { key: 'volume', amount: metric.quantity * metricUnit.base };
}

/** A base amount, as it would be written: 1250 g → "1.25 kg", 3 count:zehe → "3 Zehe". */
export function fromBase(measured: Measured, locale: Locale = 'de'): AmountParts {
    if (measured.key === 'mass') return tidy({ quantity: measured.amount, quantityMax: null, unit: 'g' }, locale);
    if (measured.key === 'volume') return tidy({ quantity: measured.amount, quantityMax: null, unit: 'ml' }, locale);
    if (measured.key === 'spoon') {
        const tablespoons = measured.amount / 15;
        return tablespoons >= 1 && Math.abs(tablespoons - Math.round(tablespoons * 2) / 2) < 0.01
            ? { quantity: Math.round(tablespoons * 2) / 2, quantityMax: null, unit: locale === 'de' ? 'EL' : 'tbsp' }
            : { quantity: Math.round((measured.amount / 5) * 4) / 4, quantityMax: null, unit: locale === 'de' ? 'TL' : 'tsp' };
    }

    const unit = measured.key.slice('count:'.length);
    return { quantity: measured.amount, quantityMax: null, unit: unit ? countUnitFor(unit, measured.amount) : null };
}

/** Whether a recipe has anything `toMetric` would change — so the switch is only offered where it matters. */
export function hasNonMetric(rows: AmountParts[]): boolean {
    return rows.some((row) => {
        const unit = unitOf(row.unit);
        return unit !== null && !unit.metric;
    });
}

/**
 * Oven temperatures in Fahrenheit get their Celsius beside them: "350°F"
 * becomes "350 °F (175 °C)". Rounded to 5, the way an oven dial is marked.
 */
export function withCelsius(text: string): string {
    return text.replace(/(\d{3})\s*°\s*F\b(?!\s*\()/g, (_, fahrenheit: string) => {
        const celsius = Math.round(((Number(fahrenheit) - 32) * 5) / 9 / 5) * 5;
        return `${fahrenheit} °F (${celsius} °C)`;
    });
}

/**
 * An amount as a line shows it. Weights and volumes as decimals — "1,5 kg",
 * as a scale reads — spoons and pieces as fractions — "1 1/2 EL".
 */
export function formatMeasured(parts: AmountParts, locale: Locale, format: (parts: AmountParts) => string): string {
    const unit = unitOf(parts.unit);
    if (parts.quantity !== null && unit && (unit.dimension === 'mass' || unit.dimension === 'volume') && unit.metric) {
        const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
        const range = parts.quantityMax !== null ? `–${number(parts.quantityMax)}` : '';
        return `${number(parts.quantity)}${range} ${parts.unit}`;
    }
    return format(parts);
}
