import { NextResponse } from 'next/server';
import { route } from '@/lib/route';
import { hasWorkToken, makeWorkToken } from '@/lib/workToken';

/** Whether a task key exists (never the key itself: only its hash is kept). */
export const GET = route({ access: 'admin', label: 'Task key status' }, async () => {
    return NextResponse.json({ exists: await hasWorkToken() });
});

/** A new task key, shown this once. The old one stops working. */
export const POST = route({ access: 'admin', label: 'Making a task key' }, async () => {
    return NextResponse.json({ token: await makeWorkToken() }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
