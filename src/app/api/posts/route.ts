import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import { slugify } from '@/lib/recipe';
import { linkCreates, refusedLinks } from '@/lib/postLinks';
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

    const { title, slug, body, imageUrl, recipeIds, collectionIds, published } = parsed.data;

    // No post about a draft, nor about something that is gone. See lib/postLinks.
    const refusal = await refusedLinks(recipeIds, collectionIds);
    if (refusal) return NextResponse.json({ message: refusal }, { status: 409 });

    try {
        const post = await prisma.post.create({
            data: {
                title,
                slug: await freeSlug(slug, title),
                body,
                ...postSearchFields({ title, body }),
                imageUrl,
                ...linkCreates(recipeIds, collectionIds),
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
