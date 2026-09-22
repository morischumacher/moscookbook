/**
 * A recipe draft: making an empty one, judging one, merging two.
 *
 * Pulled out of captureProcess, where these sat six hundred lines apart from
 * each other and from the pipeline that used them. Pure functions over the
 * ImportedRecipe shape, nothing async, nothing that reaches a network or a
 * database — which is also why they are the easiest part of the pipeline to
 * test and were among the least tested.
 */

import type { ImportedRecipe } from './recipeFromHtml';
import type { ProfileResult } from './siteProfile';
import { assessDraft } from './draftQuality';
import { parseIngredientLine } from './recipeParser';

export function emptyDraft(sourceUrl: string): ImportedRecipe {
    return {
        title: '',
        description: '',
        ingredients: [],
        instructions: '',
        imageUrl: '',
        category: '',
        nationality: '',
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
        sourceUrl,
    };
}

/**
 * Enough to publish without opening the editor?
 *
 * This is now the *scored* question rather than the three-field one it used to
 * be — see lib/draftQuality.ts for why a title, one ingredient and a non-empty
 * instructions field turned out to be a bar that "Cook Mode / Servings / Print
 * Recipe" clears comfortably.
 *
 * `good` is what used to be called ready. Everything else wants a human for a
 * minute, which is what the inbox is.
 */
export function completeness(draft: ImportedRecipe): 'ready' | 'needsWork' {
    return assessDraft(draft).quality === 'good' ? 'ready' : 'needsWork';
}

/** Fills the gaps in `draft` from `fallback`, without overwriting real data. */
export function mergeDrafts(draft: ImportedRecipe, fallback: Partial<ImportedRecipe>): ImportedRecipe {
    return {
        ...draft,
        title: draft.title || (fallback.title ?? ''),
        description: draft.description || (fallback.description ?? ''),
        ingredients: draft.ingredients.length > 0 ? draft.ingredients : (fallback.ingredients ?? []),
        instructions: draft.instructions || (fallback.instructions ?? ''),
        imageUrl: draft.imageUrl || (fallback.imageUrl ?? ''),
    };
}

/** The scoring as a single number, for comparing two drafts against each other. */
export function damageOf(draft: ImportedRecipe): number {
    return assessDraft(draft).score;
}

/**
 * What a profile read, in the shape the rest of the pipeline speaks.
 *
 * Only the four fields a profile can name. Everything else — servings, times,
 * category — stays empty rather than being guessed at, because `mergeDrafts`
 * fills holes and a guessed zero is not a hole.
 */
export function draftFromProfile(read: ProfileResult, sourceUrl: string): ImportedRecipe {
    return {
        ...emptyDraft(sourceUrl),
        title: read.title,
        instructions: read.method,
        imageUrl: read.imageUrl,
        ingredients: read.ingredients
            .map((line) => parseIngredientLine(line))
            .filter((ingredient) => ingredient.item.trim() !== ''),
    };
}
