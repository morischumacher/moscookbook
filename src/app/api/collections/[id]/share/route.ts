import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { getSiteUrl } from '@/lib/siteUrl';
import { generateShareToken, shareUrl } from '@/lib/shareToken';

/**
 * The public link for a collection.
 *
 * The same mechanism as a recipe's and an entry's, on purpose: one way of
 * making something public, one way of taking it back. "Here is the Christmas
 * menu" is the thing collections are for, and it is only useful if the person
 * receiving it does not need an account.
 */

function localeOf(request: Request): string {
    const asked = new URL(request.url).searchParams.get('locale');
    return asked === 'de' ? 'de' : 'en';
}

function parseId(raw: string): number | null {
    const id = Number.parseInt(raw, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });

    try {
        const collection: { shareToken: string | null } | null =
            await prisma.collection.findUnique({
                where: { id },
                select: { shareToken: true },
            });

        if (!collection) {
            return NextResponse.json({ message: 'Collection not found' }, { status: 404 });
        }

        // The conditional write the recipe and post routes use, for the same
        // reason: two requests that both read null both mint a token, and the
        // second overwrites a link somebody has already been handed.
        let token = collection.shareToken;

        if (!token) {
            const minted = generateShareToken();
            const claimed = await prisma.collection.updateMany({
                where: { id, shareToken: null },
                data: { shareToken: minted },
            });

            if (claimed.count === 1) {
                token = minted;
            } else {
                const fresh: { shareToken: string | null } | null =
                    await prisma.collection.findUnique({
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
            url: shareUrl(getSiteUrl(), localeOf(req), token, 'collection'),
        });
    } catch (error) {
        console.error('Collection share link failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { id: raw } = await params;
    const id = parseId(raw);
    if (id === null) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });

    try {
        // Revoking a link that is already gone is a success, not a 404: the end
        // state is what was asked for.
        await prisma.collection.updateMany({ where: { id }, data: { shareToken: null } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Collection share removal failed:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
