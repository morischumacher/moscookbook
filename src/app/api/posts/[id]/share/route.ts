import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { getSiteUrl } from '@/lib/siteUrl';
import { generateShareToken, shareUrl } from '@/lib/shareToken';

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
    const parsed = Number.parseInt(id, 10);
    return Number.isNaN(parsed) ? null : parsed;
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

        const token = post.shareToken ?? generateShareToken();

        if (!post.shareToken) {
            await prisma.post.update({ where: { id }, data: { shareToken: token } });
        }

        return NextResponse.json({
            token,
            url: shareUrl(getSiteUrl(), localeOf(req), token, 'post'),
        });
    } catch (error) {
        console.error('Post share link creation failed:', error);
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
        console.error('Post share link removal failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
