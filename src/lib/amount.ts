/**
 * Reading and printing quantities.
 *
 * Amounts are stored as numbers (see lib/ingredientParts), so scaling is plain
 * arithmetic. What is left here is the conversion at the edges: text to number
 * when a recipe is saved, number to text the way a cook would write it.
 */

/** "1 1/2" -> 1.5, "3/4" -> 0.75, "1,5" -> 1.5 */
export function parseQuantity(text: string): number | null {
    const trimmed = text.trim();
    // "1.000 g" and "1,000 g" are a thousand, not one: the German and the
    // English way of grouping thousands. ("1,5" is still one and a half.)
    const cleaned = /^\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(trimmed) ? trimmed.replace(/[.,]/g, '') : trimmed.replace(',', '.');
    if (!cleaned) return null;

    const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(cleaned);
    if (mixed) {
        const denominator = Number(mixed[3]);
        if (denominator === 0) return null;
        return Number(mixed[1]) + Number(mixed[2]) / denominator;
    }

    const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(cleaned);
    if (fraction) {
        const denominator = Number(fraction[2]);
        if (denominator === 0) return null;
        return Number(fraction[1]) / denominator;
    }

    const plain = Number(cleaned);
    return Number.isFinite(plain) ? plain : null;
}

/**
 * Renders a scaled number the way a cook would write it: whole numbers stay
 * whole, common fractions stay fractions, everything else gets at most two
 * decimals with no trailing zeros.
 */
export function formatQuantity(value: number, locale: 'en' | 'de' = 'de'): string {
    if (!Number.isFinite(value) || value <= 0) return '0';

    const rounded = Math.round(value * 1000) / 1000;

    if (Number.isInteger(rounded)) return String(rounded);

    // Large values do not need sub-unit precision: "333 g" beats "333 1/3 g".
    if (rounded >= 10) return String(Math.round(rounded));

    const whole = Math.floor(rounded);
    const remainder = rounded - whole;

    // Eighths too: a quarter cup scaled by a half is 1/8, and "0,63 Tasse"
    // is 5/8 that nobody measures as a decimal.
    const FRACTIONS: [number, string][] = [
        [0.125, '1/8'], [0.25, '1/4'], [1 / 3, '1/3'], [0.375, '3/8'], [0.5, '1/2'],
        [0.625, '5/8'], [2 / 3, '2/3'], [0.75, '3/4'], [0.875, '7/8'],
    ];

    for (const [decimal, label] of FRACTIONS) {
        if (Math.abs(remainder - decimal) < 0.02) {
            return whole > 0 ? `${whole} ${label}` : label;
        }
    }

    // The decimal separator of the page: "1,25" in German, "1.25" in English.
    const decimal = String(Math.round(rounded * 100) / 100);
    return locale === 'de' ? decimal.replace('.', ',') : decimal;
}

/** ISO 8601 duration from schema.org ("PT1H30M") to minutes. */
export function isoDurationToMinutes(value: unknown): number | null {
    if (typeof value !== 'string') return null;

    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value.trim());
    if (!match) return null;

    const [, days, hours, minutes] = match;
    const total =
        Number(days ?? 0) * 24 * 60 + Number(hours ?? 0) * 60 + Number(minutes ?? 0);

    return total > 0 ? total : null;
}

/** "4 Portionen", "serves 4", "4-6" -> 4 */
export function parseServings(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 0 && value <= 100 ? Math.round(value) : null;
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            const parsed = parseServings(entry);
            if (parsed !== null) return parsed;
        }
        return null;
    }
    if (typeof value !== 'string') return null;

    const match = /(\d+)/.exec(value);
    if (!match) return null;

    const servings = Number(match[1]);
    return servings > 0 && servings <= 100 ? servings : null;
}

/** "1 h 30 min" for display; null stays null so the UI can hide the field. */
export function formatMinutes(minutes: number | null | undefined, locale: string = 'de'): string {
    if (!minutes || minutes <= 0) return '';
    // "Min."/"Std." are German abbreviations; the English page said them too.
    const [min, hr] = locale === 'en' ? ['min', 'h'] : ['Min.', 'Std.'];
    if (minutes < 60) return `${minutes} ${min}`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} ${hr}` : `${hours} ${hr} ${rest} ${min}`;
}
