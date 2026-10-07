import { toBase } from './units';
import { formatAmount, splitAmount } from './ingredientParts';
import { choiceFor, choiceLabel, type UnitChoice } from './unitChoice';
import type { Units } from './shoppingParts';

/**
 * An ingredient's standard unit, and how a recipe row's unit stands to it.
 *
 * Every ingredient of the catalogue has one unit it is written in — "Pasta"
 * in g, "Minze" in Bund — stored as the editor's choice ('g', 'tbsp',
 * 'bunch' …; '' for pieces; a word of its own for "Dose"). A row in a unit
 * of the same kind (kg for g, l for ml, EL for ml) is no conflict: it is
 * converted by plain arithmetic. A row in another kind (Stück for g) is one,
 * unless the admin allowed that kind for the ingredient too ("several
 * units") — then it is shown on admin → Zutaten to be decided.
 *
 * Kinds are the shopping list's measures (lib/units toBase): "mass",
 * "volume", "spoon", "count:" and "count:<word>". How one kind is in another
 * comes from the ingredient's factors (lib/shoppingParts), or from the rules
 * here when it is plain arithmetic; what neither knows waits for the AI,
 * asked on the admin's tap.
 */

/** The stored form of a written unit: "EL" → 'tbsp', "Stück" → '', "Dose" → 'dose'. */
export function unitKey(written: string | null | undefined): string {
    const text = (written ?? '').trim();
    if (!text) return '';
    const choice = choiceFor(text);
    if (choice !== 'custom') return choice;
    const measure = measureOf(text);
    if (measure === 'count:') return '';
    return text.toLowerCase();
}

/** The kind of a unit: "g" → "mass", "EL" → "spoon", "" → "count:", "Bund" → "count:bund". Null when unreadable. */
export function measureOf(unit: string | null | undefined): string | null {
    const text = (unit ?? '').trim();
    if (text === '') return 'count:';
    return toBase({ quantity: 1, quantityMax: null, unit: text }, '')?.key ?? null;
}

/**
 * The family a kind belongs to for conflicts: spoons are millilitres
 * measured differently, so "2 EL Öl" beside "100 ml Öl" is no conflict —
 * no more than "kg" beside "g".
 */
export function familyOf(kind: string | null): string | null {
    return kind === 'spoon' ? 'volume' : kind;
}

/** How much of its measure one of a unit is: 1 kg → 1000 (g), 1 EL → 15 (ml), 1 Bund → 1. */
function baseOf(unit: string): number | null {
    if (unit.trim() === '') return 1;
    return toBase({ quantity: 1, quantityMax: null, unit }, '')?.amount ?? null;
}

/** The unit as the form writes it: 'tbsp' → "EL" in German, 'dose' → "Dose". */
export function unitLabel(key: string, locale: 'de' | 'en', plural = false): string {
    if (key === '') return locale === 'de' ? 'Stück' : 'pieces';
    const choice = choiceFor(key);
    if (choice !== 'custom') return choiceLabel(choice as UnitChoice, locale, plural);
    return locale === 'de' ? key[0].toUpperCase() + key.slice(1) : key;
}

/**
 * How much of `to` one of `from` is, with no AI: the same kind (1 by
 * definition, the units' own sizes do the rest), or spoons and millilitres,
 * which are one. Null when the two need knowledge of the ingredient.
 */
export function plainFactor(from: string, to: string): number | null {
    if (from === to) return 1;
    const pair = new Set([from, to]);
    if (pair.has('spoon') && pair.has('volume')) return 1;
    return null;
}

/**
 * The same knowledge measured against another buy unit — the card's main
 * unit: what converts to it stays, what does not is left out.
 */
export function rebased(units: Units, buy: string): Units {
    if (units.buy === buy) return units;
    const factors: Record<string, number> = {};
    for (const measure of new Set([units.buy, ...Object.keys(units.factors)])) {
        if (measure === buy) continue;
        const factor = factorBetween(measure, buy, units);
        if (factor) factors[measure] = Math.round(factor * 1e6) / 1e6;
    }
    return { buy, factors };
}

/** How much of `to` one of `from` is for this ingredient — its own factors, else plain arithmetic. */
export function factorBetween(from: string, to: string, units: Units | null): number | null {
    const plain = plainFactor(from, to);
    if (plain !== null) return plain;
    if (!units) return null;
    // Both measured against the unit it is bought in.
    const toBuy = (measure: string) => (measure === units.buy ? 1 : (units.factors[measure] ?? plainFactor(measure, units.buy)));
    const a = toBuy(from);
    const b = toBuy(to);
    return a && b ? a / b : null;
}

/** Rounded as a cook writes it: counted things to halves ("1½ Bund"), grams and millilitres to what reads. */
const nice = (value: number, measure: string) => {
    if (measure.startsWith('count:')) return Math.max(0.5, Math.round(value * 2) / 2);
    if (value >= 100) return Math.round(value / 5) * 5;
    if (value >= 10) return Math.round(value);
    if (value >= 1) return Math.round(value * 10) / 10;
    return Math.round(value * 100) / 100;
};

/**
 * A quantity in one unit, in another: 2 kg → 2000 g, 3 EL → 45 ml, 14 Stück
 * Frühlingszwiebeln → 2 Bund. Rounded as a cook writes it. Null when the
 * way from one to the other is not known.
 */
export function convertQuantity(quantity: number, fromUnit: string, toUnit: string, units: Units | null): number | null {
    const from = measureOf(fromUnit);
    const to = measureOf(toUnit);
    const fromBase = baseOf(fromUnit);
    const toBase = baseOf(toUnit);
    if (!from || !to || !fromBase || !toBase) return null;
    const factor = factorBetween(from, to, units);
    if (factor === null) return null;
    return nice((quantity * fromBase * factor) / toBase, to);
}

export interface UnitUse {
    /** The stored form (unitKey). */
    unit: string;
    count: number;
}

export interface UnitState {
    /** The main unit: set by the admin, else the one most rows are written in; null with no rows and none set. */
    unit: string | null;
    /** Whether it was set by the admin (rather than read off the recipes). */
    chosen: boolean;
    /**
     * The families of unit (familyOf) its rows use that the card does not
     * list with a conversion — each one question "a new unit?" on admin →
     * Zutaten: convert those recipes, or take the unit onto the card.
     */
    odd: string[];
}

/**
 * Where an ingredient stands with its units — the card (admin → Zutaten):
 *
 *     Frühlingszwiebeln
 *       Einheiten: Bund (main unit)
 *                  Stück   7 Stück = 1 Bund
 *                  g       100 g = 1 Bund
 *
 * The main unit is the one set, else the most used. A row in the main
 * unit's family is fine (kg beside g, TL beside EL); a row in a family the
 * card lists with a known conversion is fine; any other is a question.
 */
export function unitState(item: { unit: string | null; moreUnits: string[] }, uses: UnitUse[], units: Units | null = null): UnitState {
    const used = uses.filter((use) => use.count > 0);
    // A main unit is always one a European kitchen writes: the most used of those, else the metric
    // unit of the most used one ("cups" → ml, "oz" → g).
    const sorted = [...used].sort((a, b) => b.count - a.count);
    const european = sorted.find((use) => isEuropean(use.unit) || use.unit === '');
    const fallback = sorted[0] ? familyOf(measureOf(sorted[0].unit)) : null;
    const usual = european?.unit ?? (fallback ? unitForFamily(fallback === 'volume' ? 'volume' : fallback) : null);
    const main = item.unit !== null && (isEuropean(item.unit) || item.unit === '') ? item.unit : usual;
    if (main === null) return { unit: null, chosen: false, odd: [] };
    const families = [...new Set(used.map((use) => familyOf(measureOf(use.unit))).filter((kind): kind is string => kind !== null))];
    return { unit: main, chosen: item.unit !== null && main === item.unit, odd: families.filter((family) => !listedFits(family, main, item.moreUnits, units)) };
}

/** Whether a family of unit is on the card: the main unit's own, or listed with a conversion to it. */
function listedFits(family: string, main: string, moreUnits: string[], units: Units | null): boolean {
    const mainMeasure = measureOf(main);
    if (!mainMeasure) return true;
    if (family === familyOf(mainMeasure)) return true;
    // Millilitres and spoons are one family: a conversion for either will do.
    const measures = family === 'volume' ? ['volume', 'spoon'] : [family];
    return moreUnits.includes(family) && measures.some((measure) => factorBetween(measure, mainMeasure, units) !== null);
}

/** Whether a row's unit is fine for this card (green in the recipe form). */
export function unitFits(item: { unit: string | null; moreUnits: string[]; units: Units | null }, written: string): boolean {
    // "cups", "oz": never fine, whatever the card says — they are converted.
    if (written.trim() && !isEuropean(unitKey(written))) return false;
    if (item.unit === null) return true;
    const family = familyOf(measureOf(written));
    return family === null || listedFits(family, item.unit, item.moreUnits, item.units);
}

/** The unit a family is written in when nothing else says: g, ml, EL, Stück, or the family's own word. */
export function unitForFamily(family: string): string {
    if (family === 'mass') return 'g';
    if (family === 'volume') return 'ml';
    if (family === 'spoon') return 'tbsp';
    if (family === 'count:') return '';
    const word = family.slice('count:'.length);
    return unitKey(word);
}

/** A unit a European kitchen writes ("g", "EL", "Bund", "Dose") — not "cups" or "oz", which are always converted. */
export function isEuropean(unit: string): boolean {
    const measure = measureOf(unit);
    if (measure === null) return false;
    return choiceFor(unit) !== 'custom' || measure.startsWith('count:');
}

const tidyNumber = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 100) / 100);

/**
 * A conversion as the card writes it, the smaller side a whole one: "7 Stück
 * = 1 Bund", "1 EL = 14 g". `factor` is how much of the main unit one of
 * `unit` is (in the units themselves, not their base).
 */
export function conversionText(unit: string, main: string, factor: number, locale: 'de' | 'en'): { a: number; b: number; text: string } {
    const [a, b] = factor >= 1 ? [1, tidyNumber(factor)] : [tidyNumber(1 / factor), 1];
    return { a, b, text: `${a} ${unitLabel(unit, locale, a > 1)} = ${b} ${unitLabel(main, locale, b > 1)}` };
}

/** How much of `main` one of `unit` is, in the units themselves ("1 Bund" per "1 Stück": 0.14); null when unknown. */
export function perUnit(unit: string, main: string, units: Units | null): number | null {
    const from = measureOf(unit);
    const to = measureOf(main);
    const fromBase = baseOf(unit);
    const toBase = baseOf(main);
    if (!from || !to || !fromBase || !toBase) return null;
    const factor = factorBetween(from, to, units);
    return factor === null ? null : (fromBase * factor) / toBase;
}

/**
 * The factor to store for "a `unit` = b `main`", against the main unit's
 * measure (lib/shoppingParts Units): grams per gram, bunches per piece.
 */
export function storedFactor(unit: string, a: number, main: string, b: number): { measure: string; factor: number } | null {
    const measure = measureOf(unit);
    const fromBase = baseOf(unit);
    const toBase = baseOf(main);
    if (!measure || !fromBase || !toBase || !(a > 0) || !(b > 0)) return null;
    return { measure, factor: Math.round(((b * toBase) / (a * fromBase)) * 1e6) / 1e6 };
}

/**
 * The kinds of unit an ingredient is written in that the shopping list
 * cannot yet turn into the one it is bought in — what the AI is to be asked
 * for. Plain arithmetic and the ingredient's own factors need nobody.
 */
export function missingConversions(kinds: string[], units: Units | null, standard: string | null): string[] {
    const distinct = [...new Set(kinds)];
    if (distinct.length <= 1) return [];
    const buy = units?.buy ?? (standard !== null ? measureOf(standard) : null) ?? distinct[0];
    return distinct.filter((kind) => kind !== buy && factorBetween(kind, buy, units ?? { buy, factors: {} }) === null);
}

/**
 * An amount typed in one language, written in another: "1 Bund" → "1 bunch",
 * "2 EL" → "2 tbsp" — for the translation's row beside a row changed on
 * admin → Zutaten. A unit of its own ("Dose") is kept as typed.
 */
export function amountIn(amount: string, language: 'de' | 'en'): string {
    const parts = splitAmount(amount);
    if (parts.quantity === null) return amount.trim();
    const key = unitKey(parts.unit);
    if (key !== '' && choiceFor(key) === 'custom') return amount.trim();
    const many = (parts.quantityMax ?? parts.quantity) > 1;
    return formatAmount({ quantity: parts.quantity, quantityMax: parts.quantityMax, unit: key === '' ? null : unitLabel(key, language, many) }, 1, language);
}

/**
 * A translation's amount for a row: the original's numbers and unit, in the
 * translation's language ("480 ml", "2 EL" → "2 tbsp") — the amounts are the
 * same in both languages, so one is never edited, translated or converted
 * away from the other. A unit of its own ("Dose") keeps the translation's
 * own wording; a row with no amount, too.
 */
export function mirroredAmount(original: string, translated: string, language: 'de' | 'en'): string {
    const parts = splitAmount(original);
    if (!original.trim() || parts.quantity === null) return translated;
    const key = unitKey(parts.unit);
    if (key !== '' && choiceFor(key) === 'custom' && isEuropean(key)) return translated;
    return amountIn(original, language);
}
