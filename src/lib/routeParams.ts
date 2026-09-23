/**
 * A database id, read off a URL.
 *
 * Twenty-one route files parsed this by hand, in two flavours that did not
 * agree with each other. One accepted `0` and negatives. Both accepted
 * `12abc`, because `Number.parseInt` stops at the first character it does
 * not like and returns what it had — so `/api/recipes/12abc/favorite`
 * favourited recipe 12. Neither was a vulnerability on its own, since every
 * lookup was by primary key and a wrong id finds nothing. But two conventions
 * for the same thing means the next route picks one at random, and "which of
 * these is the right one" is a question that should not exist.
 *
 * The rule: the whole string must be digits, and the number must be positive.
 * `/^\d+$/` before `Number` is the part `parseInt` cannot do.
 */
export function positiveIntId(raw: string | null | undefined): number | null {
    if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw)) return null;

    const value = Number(raw);
    // Every id column is a Postgres INT4. A larger number is no row at all —
    // and handed to Prisma it was a 500 and an error report, from anybody.
    return value > 0 && value <= MAX_ID ? value : null;
}

/** The largest id an INT4 column holds. */
export const MAX_ID = 2_147_483_647;
