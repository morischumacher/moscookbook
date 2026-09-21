/**
 * The wording half of "recipes like this one".
 *
 * Split from the half that talks to the database purely so that it can be
 * tested: importing Prisma pulls in a generated client, and a pure function
 * about turning words into a query should not need one in the room.
 *
 * What it produces goes straight into `to_tsquery`, which takes an
 * *expression* — so a stray colon, ampersand or bracket is not a wrong answer,
 * it is a syntax error, from text somebody typed into a recipe form.
 */

/**
 * Turns this recipe's own words into a query.
 *
 * `plainto_tsquery` ANDs its terms, which would find almost nothing — so the
 * words are joined with `|` by hand. Everything is stripped to letters and
 * digits first, exactly as buildTsQuery does for the search box, because
 * to_tsquery takes an expression and a stray colon or ampersand is a syntax
 * error rather than a word.
 */
export function similarityQuery(text: string, max = 24): string | null {
    const words = Array.from(
        new Set(
            (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
                // Two letters and under is noise in every language this site
                // speaks: "in", "of", "zu", "g", "ml".
                .filter((word) => word.length > 2)
        )
    ).slice(0, max);

    return words.length > 0 ? words.join(' | ') : null;
}
