/**
 * Noticing that a recipe is already in the cookbook.
 *
 * Two people send you the same video; you forward yourself a link you already
 * forwarded in June. The cost of getting this wrong is asymmetric, so it is
 * only ever a *hint* shown next to the capture, never a refusal: a false
 * warning is a second of reading, a wrongly blocked recipe is a recipe lost.
 *
 * Deliberately not fuzzy-matching cleverly. "Apfelkuchen" and "Apfelkuchen mit
 * Streuseln" are different recipes and both belong in a cookbook.
 */

/**
 * The form two titles are compared in: lower case, umlauts folded both ways,
 * punctuation gone, and the words that carry no meaning dropped.
 */
const NOISE = new Set([
    'der', 'die', 'das', 'den', 'dem', 'des',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'mit', 'ohne', 'und', 'oder', 'aus', 'von', 'vom', 'im', 'in', 'auf', 'zum', 'zur',
    'the', 'a', 'an', 'with', 'and', 'or', 'of', 'from',
    'rezept', 'recipe', 'original', 'einfach', 'einfaches', 'schnell', 'schnelles',
    'beste', 'bester', 'bestes', 'best', 'super', 'lecker', 'leckere', 'leckeres',
]);

export function titleTokens(title: string): string[] {
    return title
        .toLowerCase()
        .replace(/ä/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ß/g, 'ss')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 1 && !NOISE.has(word));
}

export interface ExistingRecipe {
    id: number;
    title: string;
    slug: string;
}

export interface DuplicateHint {
    id: number;
    title: string;
    slug: string;
    /** 'link' is certain; 'title' is a suspicion worth a second of reading. */
    reason: 'link' | 'title';
}

/**
 * A recipe's title tokens, worked out once per recipe object.
 *
 * The inbox checks every capture against every recipe, so each recipe title
 * was split and folded once per capture — two hundred times over for a full
 * inbox. Keyed weakly on the row itself: the rows are read fresh for each
 * request, so the cache lives exactly as long as the list it belongs to and
 * cannot hold on to a title that has since changed.
 */
const recipeTokens = new WeakMap<ExistingRecipe, string[]>();

function tokensOf(recipe: ExistingRecipe): string[] {
    let tokens = recipeTokens.get(recipe);
    if (!tokens) {
        tokens = titleTokens(recipe.title);
        recipeTokens.set(recipe, tokens);
    }
    return tokens;
}

/**
 * How much of the shorter title the two have in common.
 *
 * Measured against the shorter one on purpose: "Apfelkuchen" against
 * "Apfelkuchen" scores 1, while "Apfelkuchen" against "Apfelkuchen mit
 * Streuseln und Vanillesauce" scores 1 too — which is why the threshold below
 * is not the whole rule.
 */
function overlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const set = new Set(b);
    const shared = a.filter((word) => set.has(word)).length;
    return shared / Math.min(a.length, b.length);
}

/**
 * Warns only when the two titles say the same thing.
 *
 * Every meaningful word must be shared *and* the lengths must be close. Without
 * the length test, "Apfelkuchen" would flag "Apfelkuchen mit Streuseln und
 * Vanillesauce" — a different cake, and the sort of warning that teaches people
 * to ignore warnings.
 */
export function findDuplicate(
    title: string,
    sourceUrl: string | null,
    existing: ExistingRecipe[],
    publishedUrls: Map<string, ExistingRecipe>
): DuplicateHint | null {
    if (sourceUrl) {
        const byLink = publishedUrls.get(sourceUrl);
        if (byLink) return { ...byLink, reason: 'link' };
    }

    const tokens = titleTokens(title);
    if (tokens.length === 0) return null;

    for (const recipe of existing) {
        const other = tokensOf(recipe);
        if (other.length === 0) continue;

        const sameLength = Math.abs(tokens.length - other.length) <= 1;
        if (sameLength && overlap(tokens, other) === 1) {
            return { ...recipe, reason: 'title' };
        }
    }

    return null;
}
