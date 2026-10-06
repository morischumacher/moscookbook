import { toBase } from './units';
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

const nice = (value: number) => {
    if (value >= 100) return Math.round(value / 5) * 5;
    if (value >= 10) return Math.round(value);
    // Halves for the small ones: "1½ Bund", "2,5 EL".
    return Math.max(0.5, Math.round(value * 2) / 2);
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
    return nice((quantity * fromBase * factor) / toBase);
}

export interface UnitUse {
    /** The stored form (unitKey). */
    unit: string;
    count: number;
}

export interface UnitState {
    /** The standard unit: set by the admin, else the one every row is written in; null when undecided. */
    unit: string | null;
    /** Whether it was set by the admin (rather than read off the recipes). */
    chosen: boolean;
    /** The families of unit (familyOf) the rows use that are neither the standard's nor allowed: what is to decide. */
    odd: string[];
}

/**
 * Where an ingredient stands with its units: its standard one, and the rows
 * in a kind that is neither that one nor allowed. Undecided (no standard) is
 * only a conflict when the rows use two kinds.
 */
export function unitState(item: { unit: string | null; moreUnits: string[] }, uses: UnitUse[]): UnitState {
    const used = uses.filter((use) => use.count > 0);
    const kinds = [...new Set(used.map((use) => familyOf(measureOf(use.unit))).filter((kind): kind is string => kind !== null))];
    if (item.unit !== null) {
        const allowed = new Set([familyOf(measureOf(item.unit)), ...item.moreUnits]);
        return { unit: item.unit, chosen: true, odd: kinds.filter((kind) => !allowed.has(kind)) };
    }
    if (kinds.length <= 1) {
        const usual = [...used].sort((a, b) => b.count - a.count)[0];
        return { unit: usual ? usual.unit : null, chosen: false, odd: [] };
    }
    const allowed = new Set(item.moreUnits);
    const open = kinds.filter((kind) => !allowed.has(kind));
    // Every kind but one allowed: the one left over is the standard.
    if (open.length <= 1) {
        const usual = [...used].filter((use) => open.length === 0 || familyOf(measureOf(use.unit)) === open[0]).sort((a, b) => b.count - a.count)[0];
        return { unit: usual ? usual.unit : null, chosen: false, odd: [] };
    }
    return { unit: null, chosen: false, odd: open };
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
