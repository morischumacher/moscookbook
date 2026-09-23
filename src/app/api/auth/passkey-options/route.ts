import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getSession } from '@/lib/auth';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { relyingParty } from '@/lib/passkeys';

/**
 * The first half of signing in with a passkey: a challenge, and no list of
 * accounts. The browser offers whichever passkeys it holds for this site, so
 * nobody has to type an address and nothing here says which addresses exist.
 */
export async function POST(req: NextRequest) {
    const limit = await rateLimitShared(clientKey(req, 'passkey-options'), 30, 15 * 60 * 1000);
    if (!limit.ok) {
        return NextResponse.json({ message: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const { rpID } = relyingParty(req.headers.get('origin'));
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });

    const session = await getSession();
    session.passkey = { challenge: options.challenge, purpose: 'login', at: Date.now() };
    await session.save();

    return NextResponse.json(options);
}
