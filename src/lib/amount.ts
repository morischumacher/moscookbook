/**
 * Scaling of free-text ingredient amounts ("200 g", "1/2 TL", "2-3 EL").
 *
 * Amounts are stored as the author typed them, so scaling works on the string:
 * find the leading quantity, multiply it, and put the rest back untouched.
 * Anything that cannot be understood is returned unchanged — a recipe must
 * never show a wrong number because the parser got confused.
 */

const NUMBER = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s+\d+\s*\/\s*\d+)?`;
const RANGE_SEPARATOR = String.raw`\s*(?:-|–|—|bis|to)\s*`;

const QUANTITY_PATTERN = new RegExp(
    `^(\\s*)(${NUMBER})(${RANGE_SEPARATOR}${NUMBER})?(.*)$`,
    'i'
);

/** "1 1/2" -> 1.5, "3/4" -> 0.75, "1,5" -> 1.5 */
export function parseQuantity(text: string): number | null {
    const cleaned = text.trim().replace(',', '.');
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
export function formatQuantity(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0';

    const rounded = Math.round(value * 1000) / 1000;

    if (Number.isInteger(rounded)) return String(rounded);

    // Large values do not need sub-unit precision: "333 g" beats "333 1/3 g".
    if (rounded >= 10) return String(Math.round(rounded));

    const whole = Math.floor(rounded);
    const remainder = rounded - whole;

    const FRACTIONS: [number, string][] = [
        [0.25, '1/4'], [1 / 3, '1/3'], [0.5, '1/2'], [2 / 3, '2/3'], [0.75, '3/4'],
    ];

    for (const [decimal, label] of FRACTIONS) {
        if (Math.abs(remainder - decimal) < 0.02) {
            return whole > 0 ? `${whole} ${label}` : label;
        }
    }

    return String(Math.round(rounded * 100) / 100).replace('.', ',');
}

/**
 * Multiplies the leading quantity of an amount string.
 * "200 g" x2 -> "400 g";  "2-3 EL" x2 -> "4-6 EL";  "etwas" x2 -> "etwas".
 */
export function scaleAmount(amount: string, factor: number): string {
    if (!amount || !Number.isFinite(factor) || factor <= 0) return amount;
    if (factor === 1) return amount;

    const match = QUANTITY_PATTERN.exec(amount);
    if (!match) return amount;

    const [, leading, first, rangePart, rest] = match;

    const firstValue = parseQuantity(first);
    if (firstValue === null) return amount;

    let scaled = formatQuantity(firstValue * factor);

    if (rangePart) {
        const separator = /^\s*(?:-|–|—|bis|to)\s*/i.exec(rangePart)?.[0] ?? '-';
        const secondRaw = rangePart.slice(separator.length);
        const secondValue = parseQuantity(secondRaw);
        if (secondValue === null) return amount;
        scaled += separator + formatQuantity(secondValue * factor);
    }

    return `${leading}${scaled}${rest}`;
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
export function formatMinutes(minutes: number | null | undefined): string {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} Min.`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
}
