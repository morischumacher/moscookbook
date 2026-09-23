import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import prisma from '@/lib/prisma';
import { getSession, requireUser } from '@/lib/auth';
import { passwordMatches } from '@/lib/accountGuard';
import { rateLimitShared } from '@/lib/rateLimitShared';
import { RP_NAME, relyingParty } from '@/lib/passkeys';

const schema = z.object({ password: z.string().min(1).max(200) });

/**
 * The first half of adding a passkey: what the browser needs to make one.
 *
 * The password is asked for. A passkey is a way into the account that
 * outlives the session, so somebody holding an unlocked, signed-in phone for
 * a minute must not be able to leave one behind for themselves.
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const limit = await rateLimitShared(`passkey:add:${auth.user.id}`, 10, 15 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json({ message: 'Too many attempts. Please wait a few minutes.' }, { status: 429 });
    }

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !(await passwordMatches(auth.user.id, parsed.data.password))) {
        return NextResponse.json({ message: 'That is not your password.' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { id: true, email: true, name: true, passkeys: { select: { credentialId: true, transports: true } } },
    });
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { rpID } = relyingParty(req.headers.get('origin'));
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: user.email,
        userDisplayName: user.name,
        userID: new TextEncoder().encode(`user-${user.id}`),
        attestationType: 'none',
        // One passkey per password manager or device: the browser says so
        // rather than making a second one for the same place.
        excludeCredentials: user.passkeys.map((key) => ({ id: key.credentialId, transports: key.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });

    const session = await getSession();
    session.passkey = { challenge: options.challenge, purpose: 'register', at: Date.now() };
    await session.save();

    return NextResponse.json(options);
}
