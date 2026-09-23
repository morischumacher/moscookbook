import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';

/**
 * Publishing one blog entry to the open web, or taking it back.
 *
 * The twin of the recipe's, and deliberately the same shape: one act, its own
 * endpoint, admin only, reversible from the same place it was performed. The
 * share control offers three stages for everything it shares, and this is the
 * third one for an entry.
 *
 * "Published" already meant something here — `publishedAt` says whether the
 * entry is finished and appears in the blog at all — so the two are kept
 * apart. An unfinished entry cannot be put on the open web, and the refusal
 * lives in the WHERE clause rather than in a read-then-write: two requests
 * that both read "finished" and then both write would each believe they were
 * the one that checked.
 *
 * Turning it *off* is never refused. If something has ended up public that
 * should not be, the way back must not be blocked by the rule that should
 * have stopped it going out.
 */

const schema = z.object({ isPublic: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const postId = positiveIntId(id);

    if (postId === null) {
        return NextResponse.json({ message: 'Invalid entry id' }, { status: 400 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json({ message: 'Public or not?' }, { status: 400 });
    }

    try {
        const updated: { count: number } = await prisma.post.updateMany({
            where: {
                id: postId,
                ...(parsed.data.isPublic ? { publishedAt: { not: null } } : {}),
            },
            data: { isPublic: parsed.data.isPublic },
        });

        if (updated.count !== 1) {
            const exists: { publishedAt: Date | null } | null = await prisma.post.findUnique({
                where: { id: postId },
                select: { publishedAt: true },
            });

            if (exists && exists.publishedAt === null) {
                return NextResponse.json(
                    { message: 'An entry has to be published in the blog before it can go on the open web.' },
                    { status: 409 }
                );
            }

            return NextResponse.json({ message: 'That entry no longer exists.' }, { status: 404 });
        }

        return NextResponse.json({ success: true, isPublic: parsed.data.isPublic });
    } catch (error) {
        failed('Post visibility failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
