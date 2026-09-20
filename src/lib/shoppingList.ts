import { formatAmount, type StructuredIngredient } from './ingredientParts';

/**
 * Merges the ingredients of several recipes into one shopping list.
 *
 * Two lines are merged only when both the name and the unit match: 200 g and
 * 300 g of flour become 500 g, but "2 Zwiebeln" and "100 g Zwiebeln" stay
 * apart, because adding them would produce a number that means nothing. The
 * same caution applies to lines without a quantity — "Salz" is listed once,
 * never as "2 Salz".
 */

export interface ShoppingSource {
    recipeId: number;
    title: string;
    slug: string;
}

export interface ShoppingItem {
    key: string;
    name: string;
    /** Ready to print, e.g. "500 g" — empty when no quantity was given. */
    amount: string;
    /** Which recipes asked for this, in the order they were selected. */
    sources: ShoppingSource[];
}

export interface RecipeForList extends ShoppingSource {
    servings: number | null;
    /** Portions the cook wants, when different from the recipe's own. */
    wantedServings?: number | null;
    ingredients: StructuredIngredient[];
}

/**
 * Names are matched exactly, apart from case and spacing.
 *
 * An earlier version stripped German plural endings so that "Zwiebeln" and
 * "Zwiebel" would merge. That also turns "Eis" into "Ei", and a shopping list
 * that quietly adds ice cream to eggs is worse than one that lists onions
 * twice. Being slightly redundant is the safe failure.
 */
function normalise(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function groupKey(name: string, unit: string | null): string {
    return `${normalise(name)}|${(unit ?? '').trim().toLowerCase()}`;
}

export function buildShoppingList(recipes: RecipeForList[]): ShoppingItem[] {
    const groups = new Map<
        string,
        {
            name: string;
            unit: string | null;
            quantity: number | null;
            quantityMax: number | null;
            raw: string;
            sources: ShoppingSource[];
        }
    >();

    for (const recipe of recipes) {
        const factor =
            recipe.servings && recipe.wantedServings
                ? recipe.wantedServings / recipe.servings
                : 1;

        const source: ShoppingSource = {
            recipeId: recipe.recipeId,
            title: recipe.title,
            slug: recipe.slug,
        };

        for (const ingredient of recipe.ingredients) {
            if (!ingredient.name.trim()) continue;

            const key = groupKey(ingredient.name, ingredient.unit);
            const existing = groups.get(key);

            const quantity =
                ingredient.quantity === null ? null : ingredient.quantity * factor;
            const quantityMax =
                ingredient.quantityMax === null ? null : ingredient.quantityMax * factor;

            if (!existing) {
                groups.set(key, {
                    name: ingredient.name.trim(),
                    unit: ingredient.unit,
                    quantity,
                    quantityMax,
                    raw: ingredient.raw,
                    sources: [source],
                });
                continue;
            }

            if (!existing.sources.some((entry) => entry.recipeId === source.recipeId)) {
                existing.sources.push(source);
            }

            // Only numbers add up. A line without a quantity contributes its
            // name and nothing else.
            if (quantity !== null) {
                // The upper bound accumulates from the previous upper bound,
                // not from the total that was just increased.
                const previousMax = existing.quantityMax ?? existing.quantity ?? 0;
                existing.quantityMax = previousMax + (quantityMax ?? quantity);
                existing.quantity = (existing.quantity ?? 0) + quantity;
            }
        }
    }

    return [...groups.entries()].map(([key, group]) => {
        let amount = '';

        if (group.quantity !== null) {
            const hasRange =
                group.quantityMax !== null &&
                Math.abs(group.quantityMax - group.quantity) > 0.001;

            amount = formatAmount(
                {
                    quantity: group.quantity,
                    quantityMax: hasRange ? group.quantityMax : null,
                    unit: group.unit,
                },
                1
            );
        } else if (group.sources.length === 1 && group.raw) {
            // A single source keeps its own wording ("etwas", "nach Geschmack").
            amount = group.raw;
        }

        return { key, name: group.name, amount, sources: group.sources };
    });
}
