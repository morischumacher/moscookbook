import { expandUmlauts } from './searchText';
import { shoppingKey } from './shopping';
import { parseQuantity } from './amount';

/**
 * What cook mode reads out of a step's text: the timers in it, and which
 * ingredients it uses.
 *
 * Both are guesses from words, and both are offered rather than imposed: a
 * timer is a button that starts when pressed, and the ingredients under a
 * step are a reminder beside the full list, not a replacement for it.
 */

export interface StepTimer {
    /** As it appears in the step: "15 Minuten", "1–2 hours". */
    label: string;
    /** The shorter end of a range: check early rather than burn. */
    seconds: number;
}

// Mixed numbers and fractions first, so "1 1/2 Stunden" is not read as "2 Stunden".
const NUMBER = String.raw`\d+\s*½|\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|½|eine[nm]?|ein|one|an?|half an|einer halben|eine halbe`;
const UNIT = String.raw`sekunden|sekunde|sek\.?|seconds?|secs?|minuten|minutes?|min\.?|mins?|stunden|stunde|std\.?|hours?|hrs?|h`;
const TIMER = new RegExp(
    String.raw`(?<![\w\/-])(${NUMBER})(?:\s*(?:-|–|—|bis|to)\s*(\d+(?:[.,]\d+)?))?\s*(${UNIT})(?![\p{L}])`,
    'giu'
);

function amountOf(word: string): number | null {
    const lower = word.toLowerCase();
    if (/^(eine[nm]?|ein|one|an?)$/.test(lower)) return 1;
    if (/^(½|half an|einer halben|eine halbe)$/.test(lower)) return 0.5;
    const mixed = /^(\d+)\s*½$/.exec(lower);
    if (mixed) return Number(mixed[1]) + 0.5;
    return parseQuantity(lower);
}

function secondsPer(unit: string): number {
    const lower = unit.toLowerCase();
    if (/^(sek|sec)/.test(lower)) return 1;
    if (/^(std|stunde|hour|hr|h$)/.test(lower)) return 3600;
    return 60;
}

export function timersIn(text: string): StepTimer[] {
    const found: StepTimer[] = [];
    for (const match of text.matchAll(TIMER)) {
        const amount = amountOf(match[1]);
        if (amount === null || amount <= 0) continue;
        const seconds = Math.round(amount * secondsPer(match[3]));
        // A "1 min" that is really a line of an ingredient list, or a
        // twenty-hour dough, is not a kitchen timer.
        if (seconds < 10 || seconds > 12 * 3600) continue;
        found.push({ label: match[0].trim(), seconds });
    }
    return found;
}

/** 90 → "1:30", 3900 → "1:05:00". */
export function clock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rest = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

function fold(text: string): string {
    return expandUmlauts(text.toLowerCase());
}

/**
 * Which of the recipe's ingredients a step mentions, by position in the list.
 *
 * Matched on the ingredient's main word ("Zwiebeln, fein gehackt" → zwiebel),
 * folded for umlauts and plurals, as the start of a word in the step — so
 * "die Zwiebeln andünsten" finds it and "Zwiebelringe" does too.
 */
export function ingredientsInStep(step: string, ingredientNames: string[]): number[] {
    const text = ` ${fold(step)}`;
    return ingredientNames.flatMap((name, index) => {
        const key = shoppingKey(name);
        const main = key.split(' ').filter((word) => word.length >= 3).pop();
        if (!main) return [];
        const stem = fold(main);
        return new RegExp(`[^\\p{L}]${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(text) ? [index] : [];
    });
}
