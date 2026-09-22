import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { getSiteUrl } from '@/lib/siteUrl';
import { generateShareToken, shareUrl } from '@/lib/shareToken';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

/**
 * The public link for one entry. Exactly the recipe route, one table over —
 * see src/app/api/recipes/[id]/share/route.ts for why it is an unguessable
 * token rather than a flag.
 */

function localeOf(request: Request): string {
    return new URL(request.url).searchParams.get('locale') === 'de' ? 'de' : 'en';
}

async function postId(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    return positiveIntId(id);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = await postId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });

    try {
        const post = await prisma.post.findUnique({
            where: { id },
            select: { shareToken: true, publishedAt: true },
        });

        if (!post) return NextResponse.json({ message: 'Post not found' }, { status: 404 });

        // A draft has no public address. Handing out a link to something that
        // is not finished is the one way this control could surprise someone.
        if (!post.publishedAt) {
            return NextResponse.json(
                { message: 'Publish the entry before sharing it.', reason: 'draft' },
                { status: 409 }
            );
        }

        // The same conditional write as the recipe route, for the same reason:
        // two requests that both read null both minted a token, and the second
        // one overwrote a link somebody had already been given.
        let token = post.shareToken;

        if (!token) {
            const minted = generateShareToken();
            const claimed = await prisma.post.updateMany({
                where: { id, shareToken: null },
                data: { shareToken: minted },
            });

            if (claimed.count === 1) {
                token = minted;
            } else {
                const fresh: { shareToken: string | null } | null = await prisma.post.findUnique({
                    where: { id },
                    select: { shareToken: true },
                });
                token = fresh?.shareToken ?? null;
            }
        }

        if (!token) {
            return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
        }

        return NextResponse.json({
            token,
            url: shareUrl(getSiteUrl(), localeOf(req), token, 'post'),
        });
    } catch (error) {
        failed('Post share link creation failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = await postId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid post ID' }, { status: 400 });

    try {
        // updateMany, so revoking a link that is already gone is a success.
        await prisma.post.updateMany({ where: { id }, data: { shareToken: null } });
        return NextResponse.json({ success: true });
    } catch (error) {
        failed('Post share link removal failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
