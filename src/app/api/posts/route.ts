import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import { slugify } from '@/lib/recipe';
import { postInputSchema, formatPostError } from '@/lib/postSchema';
import { postSearchFields } from '@/lib/searchText';
import { failed } from '@/lib/reportServerError';

/**
 * A slug nobody has taken yet.
 *
 * Same idea as the recipe side: writing something should not be stopped to ask
 * a question about an address. "Zwetschgen-2" is a better outcome than an
 * error in the middle of a draft.
 */
async function freeSlug(wanted: string, title: string): Promise<string> {
    const base = wanted || slugify(title) || 'beitrag';

    for (let attempt = 0; attempt < 50; attempt += 1) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const taken = await prisma.post.findUnique({
            where: { slug: candidate },
            select: { id: true },
        });
        if (!taken) return candidate;
    }

    return `${base}-${Date.now()}`;
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = postInputSchema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json({ message: formatPostError(parsed.error) }, { status: 400 });
    }

    const { title, slug, body, imageUrl, recipeId, published } = parsed.data;

    /*
     * No post about a draft.
     *
     * This is the line he drew himself — "zwischen es ist in der queue und
     * post" — and it is also a leak: a post can be shared at /p/<token>, which
     * needs no account, and it shows its recipe's title and link. So a post
     * about a draft is a draft with a public address by another route.
     */
    if (recipeId) {
        const recipe: { isDraft: boolean } | null = await prisma.recipe.findUnique({
            where: { id: recipeId },
            select: { isDraft: true },
        });

        if (recipe?.isDraft) {
            return NextResponse.json(
                { message: 'Zu einem Entwurf lässt sich kein Beitrag schreiben. Stelle das Rezept zuerst fertig.' },
                { status: 409 }
            );
        }
    }

    try {
        const post = await prisma.post.create({
            data: {
                title,
                slug: await freeSlug(slug, title),
                body,
                ...postSearchFields({ title, body }),
                imageUrl,
                recipeId: recipeId ?? null,
                authorId: auth.user.id,
                // The server decides the moment. A client that could set it
                // would be able to publish into the past or the future.
                publishedAt: published ? new Date() : null,
            },
            select: { id: true, slug: true, publishedAt: true },
        });

        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        // A recipe that was deleted between opening the editor and saving.
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 400 });
        }

        failed('Post creation failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
