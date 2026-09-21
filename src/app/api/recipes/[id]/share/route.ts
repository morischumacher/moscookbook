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

        // Asking twice gives the same link back rather than a second one. Two
        // live links to the same recipe would mean revoking is a thing you can
        // do incompletely without being told.
        const token = recipe.shareToken ?? generateShareToken();

        if (!recipe.shareToken) {
            await prisma.recipe.update({ where: { id }, data: { shareToken: token } });
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
