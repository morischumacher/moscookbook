import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { isAiProvider } from '@/lib/aiImport';
import { deleteAiCredential, listAiCredentials } from '@/lib/aiConfig';

/**
 * Removes a provider's key.
 *
 * Deleted, not revoked — the opposite of what a capture token does, and for the
 * opposite reason. A revoked capture token is evidence: `lastUsedAt` afterwards
 * tells you whether the phone you lost kept posting. A dead API key is evidence
 * of nothing; the record that matters is at the provider, where the key is
 * rotated, and keeping a sealed copy of a key somebody asked to be rid of is
 * just a sealed copy of a key.
 *
 * The environment variable, if there is one, takes over again afterwards. That
 * is the intended behaviour and the screen says so before the button is
 * pressed: a deployment with a key in both places is one where deleting the
 * row falls back rather than switches off.
 */
export async function DELETE(_req: NextRequest, context: { params: Promise<{ provider: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { provider } = await context.params;

    if (!isAiProvider(provider)) {
        return NextResponse.json({ message: 'Unknown provider.' }, { status: 404 });
    }

    await deleteAiCredential(provider);

    return NextResponse.json({ credentials: await listAiCredentials() });
}
