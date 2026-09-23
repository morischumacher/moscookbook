import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { positiveIntId } from '@/lib/routeParams';
import { clientKey, rateLimitShared } from '@/lib/rateLimitShared';
import { workTokenValid } from '@/lib/workToken';
import { reportWorkDone } from '@/lib/workItemsDb';

/**
 * "This task is done" — from whoever worked on it, with the task key.
 *
 * It closes nothing. The task leaves the open list and waits under "please
 * confirm" in the app, with the summary and the pull request beside it; the
 * admin's tap closes it, and the error or ticket with it.
 */
const body = z.object({
    summary: z.string().trim().min(1).max(2000),
    ref: z
        .string()
        .trim()
        .max(500)
        .regex(/^https?:\/\//, 'ref must be a web address')
        .or(z.literal(''))
        .nullish()
        .transform((value) => value || null),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limit = await rateLimitShared(clientKey(req, 'work-done'), 60, 10 * 60 * 1000);
    if (!limit.ok) return NextResponse.json({ message: 'Too many requests.' }, { status: 429 });

    if (!(await workTokenValid(req.headers.get('authorization')))) {
        return NextResponse.json({ message: 'A valid task key is needed (Authorization: Bearer …).' }, { status: 401 });
    }

    const id = positiveIntId((await params).id);
    if (id === null) return NextResponse.json({ message: 'Invalid id' }, { status: 400 });

    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ message: 'Send {"summary": "…", "ref": "https://…"}.' }, { status: 400 });
    }

    const reported = await reportWorkDone(id, parsed.data.summary, parsed.data.ref);
    if (!reported) return NextResponse.json({ message: 'No open task with that number.' }, { status: 404 });

    return NextResponse.json({ ok: true, status: 'awaitingConfirmation' });
}
