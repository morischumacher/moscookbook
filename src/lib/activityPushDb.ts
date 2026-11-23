import { after } from 'next/server';
import prisma from './prisma';
import type { SessionUser } from './session';
import { getSiteUrl } from './siteUrl';
import { failed } from './reportServerError';
import { BUNDLE_WAIT_MS, buildPush, shorten, type ActivityKind, type ActivityRow, type Push } from './activityPush';

/**
 * A push to the owner's phone when somebody else does something here: rates,
 * cooks, adds a note or photographs, writes a ticket.
 *
 * Sent through ntfy (https://ntfy.sh), configured by two environment
 * variables on Vercel:
 *
 *   NTFY_TOPIC  the topic the phone's ntfy app subscribes to — required; without
 *               it nothing is recorded and nothing is sent
 *   NTFY_TOKEN  an access token of the ntfy account (tk_…), sent as a bearer
 *               token. Optional for ntfy, but anonymous publishing shares a
 *               daily quota with everybody else on the same cloud addresses.
 *   NTFY_URL    another ntfy server; defaults to https://ntfy.sh
 *
 * The admin's own actions are never pushed: the admin is the person the
 * phone belongs to.
 *
 * Bundling: each event is a row, and the request that wrote it waits
 * BUNDLE_WAIT_MS in `after()` — once the answer has gone, so nobody waits for
 * it — and then claims every unsent row in one statement. Whichever request
 * wakes first takes them all; the others find nothing. A failed send puts the
 * rows back, so the next event takes them along.
 *
 * Nothing here may break the action it reports on: every failure is logged
 * and swallowed.
 */

export interface ActivityInput {
    kind: ActivityKind;
    recipeId?: number;
    /** Stars for a rating, the number of photographs for a photo. */
    amount?: number;
    text?: string | null;
}

function topic(): string | null {
    return process.env.NTFY_TOPIC?.trim() || null;
}

/** Keep the queue from growing for ever: sent rows older than this go. */
const KEEP_SENT_DAYS = 14;

/** Unsent rows older than this are dropped rather than sent days late. */
const STALE_HOURS = 24;

export async function recordActivity(user: SessionUser, input: ActivityInput): Promise<void> {
    if (user.admin || !topic()) return;

    try {
        const recipe = input.recipeId
            ? await prisma.recipe.findUnique({ where: { id: input.recipeId }, select: { title: true, slug: true } })
            : null;

        await prisma.activityEvent.create({
            data: {
                kind: input.kind,
                actorName: user.name || 'Jemand',
                recipeTitle: recipe?.title ?? null,
                recipeSlug: recipe?.slug ?? null,
                amount: input.amount ?? null,
                text: input.text ? shorten(input.text, 200) : null,
            },
        });
    } catch (error) {
        failed('Could not record activity for a push:', error);
        return;
    }

    after(async () => {
        await new Promise((resolve) => setTimeout(resolve, BUNDLE_WAIT_MS));
        await flushActivity();
    });
}

/** Sends everything waiting as one push. Exported for the test script. */
export async function flushActivity(): Promise<'sent' | 'nothing' | 'failed'> {
    try {
        const stale = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
        // One statement, so two requests waking together cannot both take a row.
        const claimed = await prisma.$queryRaw<(ActivityRow & { id: number })[]>`
            UPDATE "ActivityEvent" SET "sentAt" = now()
            WHERE "sentAt" IS NULL AND "createdAt" > ${stale}
            RETURNING "id", "kind", "actorName", "recipeTitle", "recipeSlug", "amount", "text", "createdAt"`;

        if (claimed.length === 0) return 'nothing';
        claimed.sort((a, b) => a.id - b.id);

        const push = buildPush(claimed, getSiteUrl());
        const ok = push ? await sendNtfy(push) : true;

        if (!ok) {
            await prisma.activityEvent.updateMany({
                where: { id: { in: claimed.map((row) => row.id) } },
                data: { sentAt: null },
            });
            return 'failed';
        }

        await prisma.activityEvent.deleteMany({
            where: { sentAt: { lt: new Date(Date.now() - KEEP_SENT_DAYS * 24 * 60 * 60 * 1000) } },
        });
        return 'sent';
    } catch (error) {
        failed('Activity push failed:', error);
        return 'failed';
    }
}

async function sendNtfy(push: Push): Promise<boolean> {
    const name = topic();
    if (!name) return false;

    const server = (process.env.NTFY_URL?.trim() || 'https://ntfy.sh').replace(/\/$/, '');
    const token = process.env.NTFY_TOKEN?.trim();

    try {
        // JSON rather than headers: a title with "ä" or "★" is not a valid header value.
        const response = await fetch(server, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ topic: name, ...push }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            failed('ntfy refused the push:', new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 200)}`));
            return false;
        }
        return true;
    } catch (error) {
        failed('ntfy could not be reached:', error);
        return false;
    }
}
