import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { positiveIntId } from '@/lib/routeParams';
import { itemComparison } from '@/lib/tokenUsageDb';
import { failed } from '@/lib/reportServerError';

/** What reading this inbox item cost, next to comparable items. See lib/tokenUsage. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    const captureId = positiveIntId((await context.params).id);
    if (captureId === null) return NextResponse.json({ message: 'Invalid capture id' }, { status: 400 });

    try {
        return NextResponse.json(await itemComparison(captureId));
    } catch (error) {
        failed('Could not read token usage:', error);
        return NextResponse.json({ message: 'That did not work.' }, { status: 500 });
    }
}
