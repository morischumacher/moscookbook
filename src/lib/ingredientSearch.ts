import { singular, expandUmlauts } from './searchText';

/**
 * Cooking from what is in the house.
 *
 * "Zucchini, Feta" is a different question from the search box, and it wants a
 * different answer. Full text ranks: type two words and a recipe matching one
 * of them well still comes back. Here that is wrong — a recipe needs *every*
 * ingredient you named, because the question is whether you can make it
 * tonight, and "you have half of it" is not an answer.
 *
 * So this matches against the structured `Ingredient` rows rather than against
 * the search vector. The column is already indexed and holds the ingredient
 * name with its quantity stripped off, which is exactly the thing being asked
 * about.
 */

/** Words that are not an ingredient and would match everything. */
const NOISE = new Set([
    'und', 'oder', 'mit', 'ohne', 'etwas', 'wenig', 'viel', 'frisch', 'frische',
    'and', 'or', 'with', 'without', 'some', 'fresh', 'a', 'an', 'the',
]);

/**
 * "Zucchini, Feta und Olivenöl" → ["zucchini", "feta", "olivenöl"].
 *
 * Commas, "und", plain spaces, hyphens and slashes all separate: people type
 * this five different ways and none of them is wrong.
 *
 * Hyphens split rather than being kept, and that is the one worth explaining.
 * "Crème-fraîche" kept whole matches nothing, because the recipe writes it
 * "Crème fraîche"; split into two words that both have to be present, it
 * matches exactly that. It also does the right thing for "Vollkorn-Mehl"
 * against a recipe that says "Vollkornmehl".
 */
export function parseIngredientQuery(input: string, max = 6): string[] {
    const words = input
        .toLowerCase()
        .split(/[,;\n/-]+|\s+/)
        .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter((word) => word.length >= 3 && !NOISE.has(word));

    // Deduplicated, because "Zucchini Zucchini" should not be harder to satisfy
    // than "Zucchini", and capped so one paste cannot turn into forty joins.
    return [...new Set(words)].slice(0, max);
}

/**
 * The spellings one typed word should match.
 *
 * Three, for the reasons the search box already knows about: what was typed,
 * the same word without its plural ending, and the ae/oe/ue spelling for a
 * keyboard or a habit that does not do umlauts. `contains` then does the rest —
 * "zwiebel" finds "rote Zwiebeln" without either side having to be exact.
 */
export function variantsOf(word: string): string[] {
    const base = word.toLowerCase();
    const forms = new Set([base]);

    const stem = singular(base);
    if (stem) forms.add(stem);

    const folded = expandUmlauts(base);
    if (folded !== base) {
        forms.add(folded);
        const foldedStem = singular(folded);
        if (foldedStem) forms.add(foldedStem);
    }

    return [...forms];
}
