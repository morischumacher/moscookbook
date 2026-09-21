/**
 * German search.
 *
 * Postgres' `german` text search configuration does two useful things and
 * fails at a third, all of which were measured rather than assumed:
 *
 *     to_tsvector('german', 'Käse')     → 'kas'       umlauts are folded
 *     to_tsvector('german', 'Kase')     → 'kas'       so "Kase" finds "Käse"
 *     to_tsvector('german', 'Kaese')    → 'kaes'      but "Kaese" does not
 *     to_tsvector('german', 'Zwiebel')  → 'zwiebel'
 *     to_tsvector('german', 'Zwiebeln') → 'zwiebeln'  plurals are NOT reduced
 *
 * So this module adds the two things the database does not provide:
 *
 *   1. `searchableText` appends an ae/oe/ue/ss spelling of every word that
 *      carries an umlaut, so a recipe written "Käsespätzle" is also findable
 *      by someone typing "Kaesespaetzle" on a keyboard without umlauts.
 *
 *   2. `buildTsQuery` searches for each word as a prefix and adds a
 *      de-pluralised alternative, so "Zwiebeln" finds "Zwiebel" and the other
 *      way round.
 *
 * Both sides are symmetric: whatever is done to the recipe on the way in is
 * done to the query on the way out.
 */

/** ä → ae, ö → oe, ü → ue, ß → ss. Lower case only; call after lowercasing. */
function expandUmlauts(word: string): string {
    return word
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss');
}

const WORD = /[\p{L}\p{N}]+/gu;

function words(text: string): string[] {
    return text.toLowerCase().match(WORD) ?? [];
}

/**
 * German plural endings, longest first.
 *
 * `-s` is included for the loanwords a recipe collection is full of (Steaks,
 * Muffins, Tacos). `-innen` and friends are not: this is a cookbook.
 */
const PLURAL_ENDINGS = ['nen', 'en', 'er', 'n', 'e', 's'];

/**
 * The shortest word that may remain after an ending is removed.
 *
 * Four is not arbitrary. At three, "Eis" loses its -s and becomes "Ei", and a
 * shopping list for ice cream starts suggesting eggs — the same trap that made
 * the shopping list refuse to stem at all. Four keeps "Eier" → "Ei" from
 * happening too, at the cost of missing a few genuine short plurals. Missing a
 * result is recoverable; a wrong result is not.
 */
const MIN_STEM = 4;

/** "zwiebeln" → "zwiebel". Returns null when no ending applies safely. */
export function singular(word: string): string | null {
    for (const ending of PLURAL_ENDINGS) {
        if (!word.endsWith(ending)) continue;
        const stem = word.slice(0, -ending.length);
        if (stem.length >= MIN_STEM) return stem;
    }
    return null;
}

/**
 * Builds the text that gets indexed.
 *
 * The original wording comes first and is left intact — it is what the German
 * stemmer is good at. The ae-spellings are appended afterwards, only for the
 * words that actually carry an umlaut, so the column does not double in size
 * for nothing.
 */
export function searchableText(...parts: (string | null | undefined)[]): string {
    const original = parts
        .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    const expansions = new Set<string>();
    for (const word of words(original)) {
        const expanded = expandUmlauts(word);
        if (expanded !== word) expansions.add(expanded);
    }

    return expansions.size === 0 ? original : `${original} ${[...expansions].join(' ')}`;
}

export interface SearchFields {
    /** Weighted A in the index: a title match should outrank a mention. */
    searchTitle: string;
    /** Weighted B: description, ingredient names and method. */
    searchBody: string;
}

/**
 * The single place the two indexed columns are built.
 *
 * Every writer — the create route, the edit route, the archive import and the
 * reindex script — goes through here, so the columns cannot drift apart
 * depending on which door a recipe came in through. `npm run check:search`
 * fails the build if a new writer forgets.
 */
export function searchFields(recipe: {
    title: string;
    description?: string | null;
    instructions?: string | null;
    ingredients?: readonly string[];
}): SearchFields {
    return {
        searchTitle: searchableText(recipe.title),
        searchBody: searchableText(
            recipe.description,
            recipe.ingredients?.join(' '),
            recipe.instructions
        ),
    };
}

/**
 * Turns what someone typed into a tsquery string.
 *
 * Every word becomes a prefix search, because "zwiebel" should find
 * "Zwiebelsuppe", and is OR-ed with its umlaut-expanded and de-pluralised
 * forms. The words themselves are AND-ed: typing more words narrows the
 * result, which is what people expect from a search box.
 *
 * Returns null when nothing usable is left, so the caller can decide what an
 * empty search means rather than being handed a query that matches nothing.
 */
export function buildTsQuery(input: string): string | null {
    const groups: string[] = [];

    for (const word of words(input)) {
        if (word.length < 2) continue;

        const alternatives = new Set<string>([word]);

        const expanded = expandUmlauts(word);
        if (expanded !== word) alternatives.add(expanded);

        // The stem is taken from the original spelling, never from the expanded
        // one. Expanding first adds a letter per umlaut, which would sneak
        // words past MIN_STEM that the rule means to protect: "käse" → "käs" is
        // correctly refused, while "kaese" → "kaes" would not be.
        const stem = singular(word);
        if (stem) {
            alternatives.add(stem);
            const expandedStem = expandUmlauts(stem);
            if (expandedStem !== stem) alternatives.add(expandedStem);
        }

        // Only letters and digits reach this point, so nothing here can carry
        // tsquery syntax. The result is still passed as a bound parameter.
        const group = [...alternatives].map((alternative) => `${alternative}:*`).join(' | ');
        groups.push(alternatives.size === 1 ? group : `(${group})`);
    }

    return groups.length === 0 ? null : groups.join(' & ');
}
