import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { generateCaptureToken, hashCaptureToken } from '@/lib/capture';

/**
 * Capture tokens: one per device that may post to the inbox.
 *
 * Per device rather than one shared secret, so that losing a phone costs one
 * revoke rather than re-configuring everything that still works.
 */

const createSchema = z.object({ label: z.string().trim().min(1).max(80) });

export async function GET() {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    // Deliberately no tokenHash: there is no reason for it to travel to a
    // browser, and a hash in a page is a hash in a screenshot.
    const tokens = await prisma.captureToken.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
    });

    return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'A name for the device is required.' }, { status: 400 });
    }

    const token = generateCaptureToken();

    const created = await prisma.captureToken.create({
        data: { label: parsed.data.label, tokenHash: hashCaptureToken(token) },
        select: { id: true, label: true, createdAt: true },
    });

    // The only time the token itself exists outside the phone it is going to.
    // It is not stored, so it cannot be shown again — which is the point.
    return NextResponse.json({ token: created, secret: token }, { status: 201 });
}
