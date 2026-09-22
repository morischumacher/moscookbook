import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getCurrentUser, requireAdmin } from '@/lib/auth';
import { rateLimitShared } from '@/lib/rateLimitShared';

/**
 * What somebody thinks is wrong with the tool, or wants it to do.
 *
 * Writing needs an account and nothing more: everybody here is trusted, and a
 * complaint that has to be approved before it is recorded is a complaint that
 * does not get written. Reading the list is for an admin, because it is a
 * to-do list rather than a conversation.
 *
 * Deliberately not a message board. There is no reply, no thread and no
 * notification: what is being collected is a sentence somebody would otherwise
 * say in a kitchen and forget, and every affordance beyond "write it down"
 * turns that into a thing they have to keep up with.
 */

/** idea | problem | other. Three, because a chooser with eight is a form. */
const KINDS = ['idea', 'problem', 'other'] as const;

/**
 * Long enough for a paragraph, short enough that nobody writes a specification
 * into it. If something needs more room than this it needs a conversation.
 */
const MAX_BODY = 2000;

const schema = z.object({
    kind: z.enum(KINDS),
    body: z.string().trim().min(1, 'Say something').max(MAX_BODY),
    /**
     * Where they were. A path of our own only — anything else is either a
     * mistake or somebody seeing whether this field is echoed back into a page
     * later, and neither is worth storing.
     */
    path: z
        .string()
        .trim()
        .max(300)
        .optional()
        .transform((value) =>
            value && value.startsWith('/') && !value.startsWith('//') ? value : null
        ),
});

export async function POST(req: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    // Per account: a generous limit that only a stuck submit button reaches.
    const limit = await rateLimitShared(`ticket:${user.id}`, 20, 60 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json(
            { message: 'That is a lot at once. Try again a little later.' },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
        );
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));

    if (!parsed.success) {
        return NextResponse.json(
            { message: parsed.error.issues[0]?.message ?? 'That did not look right.' },
            { status: 400 }
        );
    }

    try {
        const entry: { id: number; createdAt: Date } = await prisma.ticket.create({
            data: { ...parsed.data, userId: user.id },
            select: { id: true, createdAt: true },
        });

        return NextResponse.json(entry, { status: 201 });
    } catch (error) {
        console.error('Ticket failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/** The list, for whoever is going to act on it. */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const resolved = new URL(req.url).searchParams.get('resolved') === 'true';

    try {
        const entries = await prisma.ticket.findMany({
            where: resolved ? { resolvedAt: { not: null } } : { resolvedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: {
                id: true,
                kind: true,
                body: true,
                path: true,
                createdAt: true,
                resolvedAt: true,
                user: { select: { name: true } },
            },
        });

        return NextResponse.json({ entries });
    } catch (error) {
        console.error('Could not read tickets:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/** Marking one dealt with, or putting it back. */
export async function PATCH(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const body = await req.json().catch(() => null);
    const id = Number.parseInt(String((body as { id?: unknown })?.id ?? ''), 10);
    const done = Boolean((body as { resolved?: unknown })?.resolved);

    if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ message: 'Which one?' }, { status: 400 });
    }

    try {
        const updated: { count: number } = await prisma.ticket.updateMany({
            where: { id },
            data: { resolvedAt: done ? new Date() : null },
        });

        if (updated.count !== 1) {
            return NextResponse.json({ message: 'That is not there any more.' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Could not update ticket:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
