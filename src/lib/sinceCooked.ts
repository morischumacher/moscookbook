/**
 * How long ago, in the words somebody would use.
 *
 * "12. August" is a date; "three weeks ago" is the answer to the question. The
 * question here is always "is this due again", and nobody answers that by
 * subtracting dates in their head.
 *
 * Returns a key and a count for the translations to render, rather than a
 * string, so the plurals are the catalogue's problem in both languages — German
 * and English disagree about them in ways that are not worth hand-rolling.
 */

export type SinceKey = 'today' | 'yesterday' | 'days' | 'weeks' | 'months' | 'years';

export interface Since {
    key: SinceKey;
    count: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function sinceCooked(cookedAt: Date | string, now: Date = new Date()): Since {
    const then = cookedAt instanceof Date ? cookedAt : new Date(cookedAt);

    // Midnight to midnight, not hour to hour: something cooked at eleven last
    // night was cooked yesterday, whatever the clock says now.
    const startOf = (date: Date) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    const days = Math.max(0, Math.round((startOf(now) - startOf(then)) / DAY));

    if (days === 0) return { key: 'today', count: 0 };
    if (days === 1) return { key: 'yesterday', count: 1 };
    if (days < 14) return { key: 'days', count: days };

    // Weeks up to two months, because "seven weeks" is still something people
    // count; past that nobody does.
    if (days < 60) return { key: 'weeks', count: Math.round(days / 7) };
    if (days < 365) return { key: 'months', count: Math.round(days / 30) };

    return { key: 'years', count: Math.max(1, Math.floor(days / 365)) };
}
