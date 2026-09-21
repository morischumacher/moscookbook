import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { getSiteUrl } from '@/lib/siteUrl';
import { generateShareToken, shareUrl } from '@/lib/shareToken';

/**
 * Turning the public link for one recipe on and off.
 *
 * Admin only, because publishing somebody else's cookbook to the open internet
 * is not a thing a guest account should be able to do. Rating and favouriting
 * are the things a guest can do; this is an act of ownership.
 */

function localeOf(request: Request): string {
    const url = new URL(request.url);
    const asked = url.searchParams.get('locale');
    return asked === 'de' ? 'de' : 'en';
}

async function recipeId(params: Promise<{ id: string }>): Promise<number | null> {
    const { id } = await params;
    const parsed = Number.parseInt(id, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = await recipeId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

    try {
        const recipe = await prisma.recipe.findUnique({
            where: { id },
            select: { shareToken: true },
        });

        if (!recipe) return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });

        /*
         * Asking twice gives the same link back rather than a second one. Two
         * live links to the same recipe would mean revoking is a thing you can
         * do incompletely without being told.
         *
         * Which is what the read-then-write above used to allow. Two requests
         * both saw `shareToken: null`, both minted one, and the second `update`
         * overwrote the first — so the caller who had already been handed a URL
         * held one that now leads nowhere. Two taps on a phone is enough: the
         * share button asks for a link the moment it is pressed, and the
         * disabled state only exists after the first render that follows.
         *
         * updateMany with `shareToken: null` in the WHERE clause is the
         * conditional write that settles it: exactly one caller gets
         * count === 1, and everybody else re-reads what that one wrote.
         */
        let token = recipe.shareToken;

        if (!token) {
            const minted = generateShareToken();
            const claimed = await prisma.recipe.updateMany({
                where: { id, shareToken: null },
                data: { shareToken: minted },
            });

            if (claimed.count === 1) {
                token = minted;
            } else {
                // Somebody else won. Their token is the one that exists.
                const fresh: { shareToken: string | null } | null =
                    await prisma.recipe.findUnique({
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
            url: shareUrl(getSiteUrl(), localeOf(req), token),
        });
    } catch (error) {
        console.error('Share link creation failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const id = await recipeId(params);
    if (id === null) return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });

    try {
        // updateMany rather than update: revoking a link that is already gone
        // is a success, not a 404. The end state is what was asked for.
        await prisma.recipe.updateMany({ where: { id }, data: { shareToken: null } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Share link removal failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
