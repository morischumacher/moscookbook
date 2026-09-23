import { NextResponse } from 'next/server';
import { route } from '@/lib/route';
import { listOf, listsSharedWith } from '@/lib/shoppingDb';

/** The lists this person can put things on: their own first, then the ones shared with them. */
export const GET = route({ access: 'user', label: 'Shopping lists' }, async ({ user }) => {
    const [own, shared] = await Promise.all([listOf(user.id), listsSharedWith(user.id)]);
    return NextResponse.json({ own: own.id, shared });
});
