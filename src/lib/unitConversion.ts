import { splitAmount } from './ingredientParts';
import { amountLabel } from './shopping';
import { toBase } from './units';
import type { Units } from './shoppingParts';

/**
 * An ingredient's units as an admin writes and reads them on admin → Zutaten:
 * the unit it is bought in ("Bund") and one line per other unit, "7 Stück =
 * 1 Bund", "100 g = 1 Bund" — rather than the stored factors (1/7, 1/100),
 * which nobody reads.
 */

const piece = (locale: 'de' | 'en', amount: number) => (locale === 'de' ? 'Stück' : amount === 1 ? 'piece' : 'pieces');

/** "7 Stück", "100 g", "4 EL", "1 Bund" — what an amount in a measure is called. */
export function measureLabel(measure: string, amount: number, locale: 'de' | 'en'): string {
    const label = amountLabel(measure, amount, locale);
    return measure === 'count:' ? `${label} ${piece(locale, amount)}` : label;
}

/** "Bund", "g", "Stück": the buy unit's own word. */
export function buyLabel(measure: string, locale: 'de' | 'en'): string {
    if (measure === 'count:') return piece(locale, 1);
    if (measure === 'mass') return 'g';
    if (measure === 'volume') return 'ml';
    return measureLabel(measure, 1, locale).replace(/^1\s*/, '');
}

/** What "1 Bund", "7 Stück", "100 g" is, as a shopping measure and an amount in it. */
export function readAmount(text: string): { measure: string; amount: number } | null {
    const trimmed = text.trim().replace(/^(\d+(?:[.,]\d+)?)([a-zA-ZäöüÄÖÜ]+\.?)$/, '$1 $2');
    if (!trimmed) return null;
    const parts = splitAmount(/^\d|^[½⅓⅔¼¾]/.test(trimmed) ? trimmed : `1 ${trimmed}`);
    if (parts.quantity === null || !(parts.quantity > 0)) return null;
    // "Stück" is a count with no unit word, as everywhere else on the list.
    if (parts.unit && /^(stück|stk\.?|pieces?|pcs\.?)$/i.test(parts.unit)) parts.unit = null;
    const measured = toBase(parts, '');
    return measured && measured.amount > 0 ? { measure: measured.key, amount: measured.amount } : null;
}

/** The base amount one unit of a measure is shown as, before it is scaled to read well. */
const ONE: Record<string, number> = { spoon: 15, mass: 1, volume: 1 };
const nice = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 100) / 100);

/** "7 Stück = 1 Bund" for each factor, the smaller side made a whole one. */
export function conversionLines(units: Units, locale: 'de' | 'en'): string[] {
    return Object.entries(units.factors).map(([measure, factor]) => {
        let other = ONE[measure] ?? 1;
        let buy = other * factor;
        if (buy < 1 && !units.buy.startsWith('count:') && (measure === 'mass' || measure === 'volume')) {
            // "100 ml = 52 g", not "1,92 ml = 1 g".
            other = 100;
            buy = nice(100 * factor);
        } else if (buy < 1) {
            // "7 Stück = 1 Bund", not "1 Stück = 0,14 Bund".
            buy = 1;
            other = nice(1 / factor);
        } else buy = nice(buy);
        return `${measureLabel(measure, other, locale)} = ${measureLabel(units.buy, buy, locale)}`;
    });
}

/**
 * The buy unit and lines read back. Null with the line that could not be
 * read: no number, an unknown unit, or neither side in the buy unit.
 */
export function readConversion(buyText: string, lines: string[]): { units: Units } | { error: string } {
    const buy = readAmount(buyText);
    if (!buy) return { error: buyText };
    const factors: Record<string, number> = {};
    for (const line of lines.map((text) => text.trim()).filter(Boolean)) {
        const [left, right, ...rest] = line.split('=');
        const a = left ? readAmount(left) : null;
        const b = right ? readAmount(right) : null;
        if (rest.length > 0 || !a || !b) return { error: line };
        const [mine, other] = a.measure === buy.measure ? [a, b] : b.measure === buy.measure ? [b, a] : [null, null];
        if (!mine || !other || other.measure === buy.measure) return { error: line };
        factors[other.measure] = Math.round((mine.amount / other.amount) * 1e6) / 1e6;
    }
    return { units: { buy: buy.measure, factors } };
}
