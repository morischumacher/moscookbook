import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isPrismaError } from '@/lib/prismaErrors';

/**
 * "I cooked this today", and what you would change next time.
 *
 * One tap makes the entry. The note comes afterwards, like a photograph's
 * caption — asking for one up front would turn recording the fact into filling
 * in a form, and the fact is the part worth having.
 *
 * Anybody with an account may log their own cooking, and only their own: this
 * is a kitchen diary, not a shared wall, which is also why the rows cascade
 * away with the account.
 */

/** Long enough for "half the chilli, and 10 minutes less", short enough not to be an essay. */
const MAX_NOTE = 280;

async function ids(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    const parsed = Number.parseInt(id, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await ids(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const raw = typeof body?.note === 'string' ? body.note.trim() : '';
    const note = raw === '' ? null : raw.slice(0, MAX_NOTE);

    try {
        const entry = await prisma.cookLog.create({
            data: { recipeId, userId: user.id, note },
            select: { id: true, cookedAt: true, note: true },
        });

        return NextResponse.json(entry, { status: 201 });
    } catch (error) {
        // The recipe was deleted between the page rendering and the tap.
        if (isPrismaError(error, 'P2003')) {
            return NextResponse.json({ message: 'That recipe no longer exists.' }, { status: 404 });
        }

        console.error('Cook log failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/** The note on an entry. Only the person whose entry it is. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await ids(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const entryId = Number.parseInt(new URL(req.url).searchParams.get('entry') ?? '', 10);
    if (!Number.isInteger(entryId)) {
        return NextResponse.json({ message: 'Which entry?' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const raw = typeof body?.note === 'string' ? body.note.trim() : '';
    const note = raw === '' ? null : raw.slice(0, MAX_NOTE);

    try {
        // Ownership in the WHERE clause, so there is no window between asking
        // whose entry it is and writing to it.
        const updated = await prisma.cookLog.updateMany({
            where: { id: entryId, recipeId, userId: user.id },
            data: { note },
        });

        if (updated.count !== 1) {
            return NextResponse.json({ message: 'Not yours to write on.' }, { status: 403 });
        }

        return NextResponse.json({ success: true, note });
    } catch (error) {
        console.error('Cook note failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}

/**
 * Undoes an entry.
 *
 * Not an admin power, unlike deleting somebody's photograph: a photograph is on
 * a shared page and this is one person's record of their own evening.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const recipeId = await ids(params);
    if (recipeId === null) {
        return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
    }

    const entryId = Number.parseInt(new URL(req.url).searchParams.get('entry') ?? '', 10);
    if (!Number.isInteger(entryId)) {
        return NextResponse.json({ message: 'Which entry?' }, { status: 400 });
    }

    try {
        const removed = await prisma.cookLog.deleteMany({
            where: { id: entryId, recipeId, userId: user.id },
        });

        return NextResponse.json({ success: true, removed: removed.count });
    } catch (error) {
        console.error('Cook log deletion failed:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
