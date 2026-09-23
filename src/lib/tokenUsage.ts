/**
 * What a capture's AI reads cost, and how that compares.
 *
 * Tokens rather than money: prices differ by provider and model and change
 * every few months, and a token count is what the provider actually reports.
 * "Twice what an Instagram post usually takes" is the useful sentence, and it
 * needs no price list.
 */

/** What a call was for. The capture ones say which button (or none) asked. */
export const USAGE_PURPOSES = ['capture', 'retry', 'askAi', 'aiOnly', 'learn', 'import', 'polish', 'translate'] as const;
export type UsagePurpose = (typeof USAGE_PURPOSES)[number];

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export interface UsageComparison {
    own: number;
    /** The others' totals, only those a model was asked about. */
    others: number[];
    median: number | null;
    /** own ÷ median, or null with nothing to compare against. */
    ratio: number | null;
}

export function compareUsage(own: number, others: number[]): UsageComparison {
    const asked = others.filter((value) => value > 0);
    const middle = median(asked);
    return {
        own,
        others: asked,
        median: middle,
        ratio: middle ? Math.round((own / middle) * 10) / 10 : null,
    };
}

/** "1.2k" for a tile; the exact number is in the tooltip. */
export function shortTokens(value: number, locale: string): string {
    if (value < 1000) return String(value);
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1000)}k`;
}
