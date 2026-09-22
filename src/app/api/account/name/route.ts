import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { fullName } from '@/lib/personName';
import { formatZodError } from '@/lib/zodMessage';

const schema = z.object({
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().max(80),
});

/**
 * Changing your own name.
 *
 * The smallest gap of the lot and the most obviously missing: the name is
 * typed once at registration, shown in the greeting on every page and against
 * every photograph of something you cooked, and could not be corrected. A typo
 * was permanent unless an admin went into the database.
 *
 * No password asked for, unlike the routes beside this one. Changing a display
 * name takes nothing away from anybody and gives nobody anything — the reason
 * those ask is that they decide who can get back in, and this does not.
 *
 * `name` is kept in step with the two parts because the rest of the
 * application reads it: the column is the joined form, and two fields that
 * disagree about somebody's name is how a greeting ends up saying one thing
 * and a cooking log another.
 */
export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
        return NextResponse.json({ message: formatZodError(parsed.error) }, { status: 400 });
    }

    const { firstName, lastName } = parsed.data;
    const name = fullName({ firstName, lastName });

    await prisma.user.update({
        where: { id: auth.user.id },
        data: { firstName, lastName, name },
    });

    return NextResponse.json({ ok: true, name });
}
