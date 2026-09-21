/**
 * Rebuilds the search columns for every recipe and every written entry.
 *
 *   npm run reindex
 *
 * Needed once after the 0002_search migration, and any time the indexing rules
 * in src/lib/searchText.ts change — the tsvector is derived by Postgres, but
 * the two text columns it derives from are written by this application, so a
 * change to the rules does not reach existing rows on its own.
 *
 * Safe to run repeatedly: it recomputes from the recipe, it does not accumulate.
 */
import { PrismaClient } from '@prisma/client';
import { searchFields, postSearchFields } from '../src/lib/searchText';

const prisma = new PrismaClient();

interface Row {
    id: number;
    title: string;
    description: string | null;
    instructions: string;
    ingredients: { name: string }[];
}

async function main(): Promise<void> {
    const recipes: Row[] = await prisma.recipe.findMany({
        select: {
            id: true,
            title: true,
            description: true,
            instructions: true,
            ingredients: { select: { name: true }, orderBy: { position: 'asc' } },
        },
        orderBy: { id: 'asc' },
    });

    let changed = 0;

    for (const recipe of recipes) {
        const fields = searchFields({
            title: recipe.title,
            description: recipe.description,
            instructions: recipe.instructions,
            ingredients: recipe.ingredients.map((ingredient) => ingredient.name),
        });

        await prisma.recipe.update({ where: { id: recipe.id }, data: fields });
        changed += 1;
    }

    // Entries too, since version 2 of the search covers them. Same helper
    // family, same reason to run this after a restore: the archive carries the
    // words, not their ae/oe/ue expansions.
    const posts: { id: number; title: string; body: string }[] = await prisma.post.findMany({
        select: { id: true, title: true, body: true },
        orderBy: { id: 'asc' },
    });

    let postsChanged = 0;

    for (const post of posts) {
        await prisma.post.update({
            where: { id: post.id },
            data: postSearchFields({ title: post.title, body: post.body }),
        });
        postsChanged += 1;
    }

    console.log(
        `Reindexed ${changed} of ${recipes.length} recipes and ${postsChanged} of ${posts.length} entries.`
    );
}

main()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
