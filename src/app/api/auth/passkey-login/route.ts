import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { sessionUserFrom } from '@/lib/session';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { freshChallenge, relyingParty } from '@/lib/passkeys';
import { failed } from '@/lib/reportServerError';

/**
 * The second half of signing in with a passkey: the signature is checked
 * against the public key stored for that passkey, and the session is made
 * exactly as a password sign-in makes it.
 */
export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'login'), 10, 15 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json({ message: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const session = await getSession();
    const challenge = freshChallenge(session.passkey, 'login');
    session.passkey = undefined;

    const response = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null;
    if (!challenge || !response?.id) {
        await session.save();
        return NextResponse.json({ message: 'That took too long. Please try again.' }, { status: 400 });
    }

    const passkey = await prisma.passkey.findUnique({
        where: { credentialId: response.id },
        include: { user: true },
    });
    if (!passkey) {
        await session.save();
        // Most often a passkey whose account was deleted, or one removed on
        // the account page while the device still has it.
        return NextResponse.json({ message: 'This passkey is not known here (any more).' }, { status: 401 });
    }

    const { rpID, origins } = relyingParty(req.headers.get('origin'));

    try {
        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: origins,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialId,
                publicKey: new Uint8Array(passkey.publicKey),
                counter: passkey.counter,
                transports: passkey.transports,
            },
            // A passkey is the only factor here: a borrowed security key without
            // a PIN, or a phone handed over unlocked, must not be enough.
            requireUserVerification: true,
        });
        if (!verification.verified) {
            await session.save();
            return NextResponse.json({ message: 'That passkey could not be checked.' }, { status: 401 });
        }

        await prisma.passkey.update({
            where: { id: passkey.id },
            data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
        });

        session.user = sessionUserFrom(passkey.user);
        await session.save();
        return NextResponse.json({ success: true, admin: passkey.user.admin });
    } catch (error) {
        failed('Passkey sign-in failed:', error);
        await session.save();
        return NextResponse.json({ message: 'That passkey could not be checked.' }, { status: 401 });
    }
}
