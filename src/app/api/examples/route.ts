import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { route } from '@/lib/route';
import { postSearchFields } from '@/lib/searchText';
import { linkCreates } from '@/lib/postLinks';
import { exampleCollection, examplePost, type ExampleRecipe } from '@/lib/examples';

/**
 * Makes the example entry or the example collection. See lib/examples.
 *
 * Once each: asked for a second time, it answers with the one already there
 * rather than making another, so the button cannot fill the blog with copies.
 * The entry is left unpublished — an example is for the person writing, not
 * for the people reading.
 */
const body = z.object({
    kind: z.enum(['post', 'collection']),
    locale: z.enum(['en', 'de']).default('de'),
});

async function ourRecipes(): Promise<ExampleRecipe[]> {
    const rows = await prisma.recipe.findMany({
        where: { isDraft: false },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
            id: true,
            title: true,
            slug: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        },
    });
    // Those with a picture first: the example is mostly about pictures.
    return rows
        .map((row) => ({ id: row.id, title: row.title, slug: row.slug, image: row.images[0]?.url ?? null }))
        .sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)));
}

async function ensureCollection(locale: 'en' | 'de', recipes: ExampleRecipe[]) {
    const example = exampleCollection(locale, recipes);
    const existing = await prisma.collection.findUnique({
        where: { slug: example.slug },
        select: { id: true, slug: true, title: true },
    });
    if (existing) return { collection: existing, created: false };

    const collection = await prisma.collection.create({
        data: {
            title: example.title,
            slug: example.slug,
            description: example.description,
            imageUrl: example.imageUrl,
            recipes: { create: example.recipeIds.map((recipeId, position) => ({ recipeId, position })) },
        },
        select: { id: true, slug: true, title: true },
    });
    return { collection, created: true };
}

export const POST = route({ access: 'admin', body, label: 'Example' }, async ({ user, body: { kind, locale } }) => {
    const recipes = await ourRecipes();
    const { collection, created } = await ensureCollection(locale, recipes);

    if (kind === 'collection') {
        return NextResponse.json({ id: collection.id, slug: collection.slug, created }, { status: created ? 201 : 200 });
    }

    const example = examplePost(locale, recipes, collection);
    const existing = await prisma.post.findUnique({ where: { slug: example.slug }, select: { id: true, slug: true } });
    if (existing) return NextResponse.json({ ...existing, created: false });

    const post = await prisma.post.create({
        data: {
            title: example.title,
            slug: example.slug,
            body: example.body,
            ...postSearchFields({ title: example.title, body: example.body }),
            imageUrl: example.imageUrl,
            authorId: user.id,
            publishedAt: null,
            ...linkCreates(example.recipeIds, example.collectionIds),
        },
        select: { id: true, slug: true },
    });

    return NextResponse.json({ ...post, created: true }, { status: 201 });
});
