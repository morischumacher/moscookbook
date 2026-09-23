import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';
import { slugify } from '@/lib/recipe';
import { linkReplacements, refusedLinks } from '@/lib/postLinks';
import { postInputSchema, formatPostError } from '@/lib/postSchema';
import { postSearchFields } from '@/lib/searchText';
import { deleteBlobs } from '@/lib/blobCleanup';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

async function postId(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    return positiveIntId(id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = await postId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });

    const parsed = postInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: formatPostError(parsed.error) }, { status: 400 });
    }

    const { title, slug, body, imageUrl, recipeIds, collectionIds, published } = parsed.data;

    // The same rule as a new entry — which this route never checked, so an
    // entry could be attached to a draft by editing it. See lib/postLinks.
    const refusal = await refusedLinks(recipeIds, collectionIds);
    if (refusal) return NextResponse.json({ message: refusal }, { status: 409 });

    try {
        const existing = await prisma.post.findUnique({
            where: { id },
            select: { publishedAt: true, slug: true, imageUrl: true },
        });

        if (!existing) return NextResponse.json({ message: 'Post not found' }, { status: 404 });

        // Publishing sets the date once and then leaves it alone. Editing a
        // published entry must not move it back to the top of the list as if
        // it were new — the date is when it was said, not when it was last
        // touched, and `updatedAt` already records the latter.
        const publishedAt = published ? existing.publishedAt ?? new Date() : null;

        const post = await prisma.post.update({
            where: { id },
            data: {
                title,
                slug: slug || existing.slug || slugify(title),
                body,
                ...postSearchFields({ title, body }),
                imageUrl,
                ...linkReplacements(recipeIds, collectionIds),
                publishedAt,
            },
            select: { id: true, slug: true, publishedAt: true },
        });

        // The picture it had, when it now has another or none — the way the
        // delete below and a collection's edit already do.
        if (existing.imageUrl && existing.imageUrl !== imageUrl) await deleteBlobs([existing.imageUrl]);

        return NextResponse.json(post);
    } catch (error) {
        if (isPrismaError(error, 'P2002')) {
            return NextResponse.json(
                { message: 'Another entry already has that address.' },
                { status: 409 }
            );
        }
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 400 });
        }
        // Deleted in another tab between reading and writing.
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Post not found' }, { status: 404 });
        }

        failed('Post update failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = await postId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });

    try {
        const doomed: { imageUrl: string | null } | null = await prisma.post.findUnique({
            where: { id },
            select: { imageUrl: true },
        });

        await prisma.post.delete({ where: { id } });

        if (doomed?.imageUrl) await deleteBlobs([doomed.imageUrl]);

        return NextResponse.json({ success: true });
    } catch (error) {
        // Already gone is the end state that was asked for.
        if (isPrismaError(error, 'P2025')) return NextResponse.json({ success: true });

        failed('Post deletion failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
