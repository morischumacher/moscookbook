import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin, getCurrentUser } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import {
    collectionInputSchema,
    collectionSlug,
    formatCollectionError,
} from '@/lib/collectionSchema';
import { failed } from '@/lib/reportServerError';

/**
 * Collections: a handful of recipes with a name on it.
 *
 * Reading is for anybody with an account, because a collection is a way around
 * the cookbook. Making one is for an admin, like making a recipe — it is an act
 * of arranging somebody else's kitchen.
 */

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    try {
        const collections = await prisma.collection.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                id: true,
                title: true,
                slug: true,
                description: true,
                // The secret link opens the collection's private recipes to
                // anybody; members must not be able to collect it here.
                shareToken: user.admin,
                // The count rather than the rows: a list of collections shows
                // "6 recipes", not six recipes.
                _count: { select: { recipes: true } },
            },
        });

        return NextResponse.json({ collections });
    } catch (error) {
        failed('Collections could not be listed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = collectionInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: formatCollectionError(parsed.error) }, { status: 400 });
    }

    const { title, description, imageUrl, recipeIds } = parsed.data;

    // Two saves of the same title at once both find the same free slug; the
    // second then trips the unique index. Once more, and it finds the next.
    const create = async () =>
        prisma.collection.create({
            data: {
                title,
                description,
                imageUrl,
                slug: await freeSlug(title),
                // Position is the order they arrived in, which is the order
                // somebody arranged them in the form.
                recipes: {
                    create: recipeIds.map((recipeId, index) => ({ recipeId, position: index })),
                },
            },
            select: { id: true, slug: true, title: true },
        });

    try {
        const collection = await create().catch((error) => {
            if (isPrismaError(error, 'P2002')) return create();
            throw error;
        });

        return NextResponse.json(collection, { status: 201 });
    } catch (error) {
        // A recipe that was deleted between the form loading and being saved.
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json(
                { message: 'One of those recipes no longer exists.' },
                { status: 409 }
            );
        }

        failed('Collection could not be created:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

/**
 * A slug nothing else is using.
 *
 * Two collections called "Weihnachten" is not a mistake — one is last year's —
 * so the second one gets a number rather than an error. The loop is bounded
 * because an unbounded one is a way to hang a request.
 */
export async function freeSlug(title: string): Promise<string> {
    const base = collectionSlug(title);

    for (let suffix = 0; suffix < 50; suffix += 1) {
        const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
        const taken = await prisma.collection.findUnique({
            where: { slug: candidate },
            select: { id: true },
        });

        if (!taken) return candidate;
    }

    // Fifty collections with one name is not a case worth a nicer answer.
    return `${base}-${Date.now()}`;
}
