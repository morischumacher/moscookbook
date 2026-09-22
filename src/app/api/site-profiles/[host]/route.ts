import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth';
import { hostOf } from '@/lib/siteProfile';
import { forgetSite } from '@/lib/siteProfileDb';

/**
 * Forgetting a site.
 *
 * The counterpart to learning one, and the honest answer to "this profile is
 * wrong and I do not want to argue with it". The next import from that site
 * falls back to the rules and, if a key is configured, learns it again from
 * scratch.
 *
 * Deleting rather than marking stale, because a row nobody trusts is not
 * evidence of anything. The stale flag is for profiles that *earned* their
 * retirement by failing three imports; this is somebody saying so directly.
 */
export async function DELETE(_: Request, context: { params: Promise<{ host: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const { host: raw } = await context.params;

    // Accepts either a bare hostname or a full address, because the thing on
    // screen next to the button might be either.
    const host = hostOf(raw.includes('://') ? raw : `https://${raw}`);
    if (!host) {
        return NextResponse.json({ message: 'Das ist kein Hostname.' }, { status: 400 });
    }

    await forgetSite(host);

    return NextResponse.json({ forgotten: host });
}
