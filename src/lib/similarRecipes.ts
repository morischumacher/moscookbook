import prisma from './prisma';
import { similarityQuery } from './similarity';

/**
 * Four recipes like this one, at the end of a recipe.
 *
 * The cheapest good feature in the application, because the hard part is
 * already built: every recipe carries a tsvector of its title, description,
 * method and ingredients, with an index on it. Asking "which other recipes
 * does this one's vector match" is the same question the search box asks, in
 * the other direction.
 *
 * Postgres can do it in one statement with no extra column and no second
 * index. `ts_rank` against a query built from this recipe's own searchable
 * text ranks everything else by how much they have in common; the recipe
 * itself is excluded, and so is anything that scores near zero — four weak
 * matches at the bottom of a page are worse than none, because they claim a
 * relationship that is not there.
 *
 * Deliberately *not* "same category": a category is a shelf, and the
 * interesting suggestion is the one that shares an unusual ingredient across
 * shelves. Category does earn a small boost below, because two main courses
 * really are more alike than a main course and a cake.
 */

export interface SimilarRecipe {
    id: number;
    title: string;
    slug: string;
    imageUrl: string | null;
}

/** How alike two recipes have to be before the suggestion is worth making. */
const MINIMUM_RANK = 0.02;

const HOW_MANY = 4;

export async function similarRecipes(recipe: {
    id: number;
    searchTitle: string;
    searchBody: string;
    category: string | null;
}, locale?: string): Promise<SimilarRecipe[]> {
    const query = similarityQuery(`${recipe.searchTitle} ${recipe.searchBody}`);
    if (!query) return [];

    // Parameterised throughout: `query` is built from a recipe's own text, but
    // a recipe's own text is something a person typed, and the difference
    // between "our data" and "safe" is exactly the assumption that goes wrong.
    const rows: { id: number; title: string; slug: string; imageUrl: string | null }[] =
        await prisma.$queryRaw<{ id: number; title: string; slug: string; imageUrl: string | null }[]>`
            SELECT r."id",
                   -- In the reader's language when translated, as on the
                   -- home page: "Green Curry" sat on the German page.
                   COALESCE(
                       (
                           SELECT t."title"
                           FROM "RecipeTranslation" t
                           WHERE t."recipeId" = r."id"
                             AND t."locale" = ${locale ?? ''}
                             AND r."language" IS DISTINCT FROM ${locale ?? ''}
                           LIMIT 1
                       ),
                       r."title"
                   ) AS "title",
                   r."slug",
                   (
                       SELECT i."url"
                       FROM "Image" i
                       WHERE i."recipeId" = r."id"
                       ORDER BY i."position" ASC
                       LIMIT 1
                   ) AS "imageUrl"
            FROM "Recipe" r
            WHERE r."id" <> ${recipe.id}
              -- Suggesting a draft would be the cookbook recommending something
              -- nobody here has cooked yet, under a heading that says otherwise.
              AND r."isDraft" = false
              -- Nor one only the admins see: this list is shown to the household.
              AND r."onlyMe" = false
              AND r."searchVector" @@ to_tsquery('german', ${query})
              AND ts_rank(r."searchVector", to_tsquery('german', ${query})) > ${MINIMUM_RANK}
            ORDER BY ts_rank(r."searchVector", to_tsquery('german', ${query}))
                         * (CASE WHEN r."category" IS NOT DISTINCT FROM ${recipe.category} THEN 1.25 ELSE 1 END)
                     DESC,
                     r."createdAt" DESC
            LIMIT ${HOW_MANY}
        `;

    return rows;
}
