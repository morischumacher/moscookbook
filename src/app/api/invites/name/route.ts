import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { checkName } from '@/lib/inviteName';
import { takenNames } from '@/lib/inviteNameDb';

/**
 * Is this name free? Asked while the admin types the name of somebody they
 * are inviting, so a clash is said before the link exists. See lib/inviteName.
 */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const params = new URL(req.url).searchParams;
    const wanted = {
        firstName: (params.get('first') ?? '').slice(0, 80),
        lastName: (params.get('last') ?? '').slice(0, 80),
    };

    return NextResponse.json(checkName(wanted, await takenNames()));
}
