import type { StructuredIngredient } from './ingredientParts';
import { toDisplayIngredient } from './ingredientParts';

/**
 * schema.org/Recipe for a recipe of our own.
 *
 * The import side of this application reads exactly this markup out of other
 * people's pages. Emitting it is the other half of that bargain: it lets Google
 * show the recipe properly, lets anyone else's importer read it, and — the part
 * worth having — lets this cookbook import from itself, which is what the
 * round-trip test does.
 *
 * Only fields that are actually known are emitted. A `recipeYield` of "null
 * servings" or a `cookTime` of PT0M is worse than saying nothing.
 */

export interface JsonLdRecipeInput {
    title: string;
    description: string | null;
    instructions: string;
    category: string | null;
    nationality: string | null;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    createdAt: Date;
    images: { url: string }[];
    ingredients: StructuredIngredient[];
    ratings: { value: number }[];
    url: string;
}

/** 90 → "PT1H30M". Minutes only would be valid but is read by fewer tools. */
export function isoDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `PT${rest}M`;
    if (rest === 0) return `PT${hours}H`;
    return `PT${hours}H${rest}M`;
}

/**
 * Markdown instructions into discrete steps.
 *
 * Numbered lists, dashed lists and blank-line-separated paragraphs are all
 * ways people write a method, and a reader wants the steps apart. Splitting on
 * blank lines first, then stripping any leading marker, handles all three
 * without needing to know which one was used.
 */
export function instructionSteps(instructions: string): string[] {
    return instructions
        .split(/\n\s*\n/)
        .flatMap((block) => (/^\s*(\d+[.)]|[-*•])\s/m.test(block) ? block.split('\n') : [block]))
        .map((step) => step.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
        .filter((step) => step !== '');
}

export function buildRecipeJsonLd(recipe: JsonLdRecipeInput): Record<string, unknown> {
    const steps = instructionSteps(recipe.instructions);

    const data: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: recipe.title,
        url: recipe.url,
        datePublished: recipe.createdAt.toISOString(),
        // One string per ingredient, the way it is written on a shopping list.
        // toDisplayIngredient splits the amount from the name for the page's
        // two-column layout; schema.org wants them back together, and an array
        // of {amount, item} objects is markup no importer can read — which the
        // round-trip test noticed the moment it was written.
        recipeIngredient: recipe.ingredients.map((ingredient) => {
            const { amount, item } = toDisplayIngredient(ingredient);
            return amount ? `${amount} ${item}` : item;
        }),
        recipeInstructions: steps.map((step) => ({ '@type': 'HowToStep', text: step })),
    };

    if (recipe.description?.trim()) data.description = recipe.description.trim();
    if (recipe.images.length > 0) data.image = recipe.images.map((image) => image.url);
    if (recipe.category?.trim()) data.recipeCategory = recipe.category.trim();
    if (recipe.nationality?.trim()) data.recipeCuisine = recipe.nationality.trim();
    if (recipe.servings !== null) data.recipeYield = String(recipe.servings);
    if (recipe.prepMinutes !== null) data.prepTime = isoDuration(recipe.prepMinutes);
    if (recipe.cookMinutes !== null) data.cookTime = isoDuration(recipe.cookMinutes);

    if (recipe.prepMinutes !== null && recipe.cookMinutes !== null) {
        data.totalTime = isoDuration(recipe.prepMinutes + recipe.cookMinutes);
    }

    if (recipe.ratings.length > 0) {
        const sum = recipe.ratings.reduce((total, rating) => total + rating.value, 0);
        data.aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: Number((sum / recipe.ratings.length).toFixed(2)),
            ratingCount: recipe.ratings.length,
            bestRating: 5,
            worstRating: 1,
        };
    }

    return data;
}
