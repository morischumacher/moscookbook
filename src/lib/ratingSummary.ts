import type { Prisma } from '@prisma/client';
import prisma from './prisma';

/**
 * How a recipe was rated, as two numbers rather than every rating row.
 *
 * The recipe page used to load all of a recipe's ratings to add them up and
 * count them. Two numbers are all it ever showed, so the database does the
 * adding. The sum rather than the average is carried so that every surface
 * divides exactly as it did when it summed the rows itself — the JSON-LD
 * rounds to two places, and a float from the database's own `avg` could land
 * on the other side of a rounding boundary.
 */
export interface RatingSummary {
    count: number;
    sum: number;
}

export const NO_RATINGS: RatingSummary = { count: 0, sum: 0 };

/** The mean, or 0 for a recipe nobody has rated — what the page always showed. */
export function averageOf(summary: RatingSummary): number {
    return summary.count > 0 ? summary.sum / summary.count : 0;
}

/**
 * The summary for whichever recipe `where` finds.
 *
 * Takes a filter on the recipe rather than an id so a page can ask for it in
 * the same breath as it asks for the recipe, instead of waiting for the row
 * to learn the id first.
 */
export async function loadRatingSummary(where: Prisma.RecipeWhereInput): Promise<RatingSummary> {
    const aggregate = await prisma.rating.aggregate({
        where: { recipe: where },
        _count: { _all: true },
        _sum: { value: true },
    });
    return { count: aggregate._count._all, sum: aggregate._sum.value ?? 0 };
}
