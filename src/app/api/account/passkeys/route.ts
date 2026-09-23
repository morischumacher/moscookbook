import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import prisma from '@/lib/prisma';
import { getSession, requireUser } from '@/lib/auth';
import { deviceName, freshChallenge, relyingParty } from '@/lib/passkeys';
import { failed } from '@/lib/reportServerError';

/** Your passkeys, for the list on the account page. */
export async function GET() {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const passkeys = await prisma.passkey.findMany({
        where: { userId: auth.user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, backedUp: true, createdAt: true, lastUsedAt: true },
    });
    return NextResponse.json({ passkeys });
}

/**
 * The second half of adding a passkey: the browser's answer, checked against
 * the challenge the first half put in the cookie, and the public key kept.
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const session = await getSession();
    const challenge = freshChallenge(session.passkey, 'register');
    session.passkey = undefined;
    await session.save();
    if (!challenge) {
        return NextResponse.json({ message: 'That took too long. Please try again.' }, { status: 400 });
    }

    const response = (await req.json().catch(() => null)) as RegistrationResponseJSON | null;
    if (!response) return NextResponse.json({ message: 'Nothing was sent.' }, { status: 400 });

    const { rpID, origins } = relyingParty(req.headers.get('origin'));

    try {
        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: origins,
            expectedRPID: rpID,
            requireUserVerification: true,
        });
        if (!verification.verified) {
            return NextResponse.json({ message: 'The passkey could not be checked.' }, { status: 400 });
        }

        const { credential, credentialBackedUp } = verification.registrationInfo;
        const saved = await prisma.passkey.create({
            data: {
                userId: auth.user.id,
                credentialId: credential.id,
                publicKey: Buffer.from(credential.publicKey),
                counter: credential.counter,
                transports: credential.transports ?? [],
                name: deviceName(req.headers.get('user-agent')),
                backedUp: credentialBackedUp,
            },
            select: { id: true, name: true, backedUp: true, createdAt: true, lastUsedAt: true },
        });
        return NextResponse.json({ passkey: saved }, { status: 201 });
    } catch (error) {
        failed('Adding a passkey failed:', error);
        return NextResponse.json({ message: 'The passkey could not be saved.' }, { status: 400 });
    }
}
