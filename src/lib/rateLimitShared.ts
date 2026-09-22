import type { NextRequest } from 'next/server';
import prisma from './prisma';

/**
 * A rate limit that all the instances share.
 *
 * `rateLimit` in lib/rateLimit.ts keeps its counts in a Map inside the
 * process, and its own comment admits this is soft. What that means in
 * practice is worth spelling out: on Vercel the process is one warm instance
 * among however many the platform decided to start, so "ten login attempts per
 * fifteen minutes" meant ten times the number of warm instances, and every
 * cold start put the count back to zero. Under the concurrent load that a
 * password-guessing run actually produces, the platform obligingly starts more
 * instances — so the limit loosened exactly when it was needed.
 *
 * This keeps the count in the database, where there is one of it.
 *
 * One statement per check, and the count is incremented by the same statement
 * that reads it, so two requests arriving together cannot both read four and
 * both write five. Postgres settles it, which is what it is for.
 *
 * Not used for everything. The view counter stays on the in-process limiter:
 * it already writes to the database, and a second write to ration the first is
 * a strange trade for a number that only decides which recipes look popular.
 * This is for the places where the limit is a security property — signing in,
 * asking for a password reset, redeeming an invitation, and anything an
 * unauthenticated caller can make the application do work for.
 */

export interface SharedLimit {
    ok: boolean;
    /** How many are left in this window, for a header if one is wanted. */
    remaining: number;
    retryAfterSeconds: number;
}

/**
 * Never refuses on failure.
 *
 * If the database cannot be reached, the limiter cannot say whether this is
 * the eleventh attempt — and locking everybody out of a working site because
 * the *limiter* is broken turns a degraded database into an outage. The window
 * the request is allowed through is the same window in which nothing else
 * works either.
 */
const ALLOW_ON_FAILURE: SharedLimit = { ok: true, remaining: 0, retryAfterSeconds: 0 };

export async function rateLimitShared(
    key: string,
    limit: number,
    windowMs: number
): Promise<SharedLimit> {
    const now = new Date();
    const expires = new Date(now.getTime() + windowMs);

    try {
        /*
         * Insert, or bump what is there. The CASE is what makes a window
         * *close*: a row whose expiry has passed is reused rather than
         * deleted, so a returning caller starts at one again without anything
         * having had to tidy up first.
         *
         * RETURNING gives back the state after the write, which is the only
         * state that can be reasoned about — anything read beforehand is
         * already out of date by the time it is looked at.
         */
        const rows: { count: number; expiresAt: Date }[] = await prisma.$queryRaw<
            { count: number; expiresAt: Date }[]
        >`
            INSERT INTO "RateLimit" ("key", "count", "expiresAt")
            VALUES (${key}, 1, ${expires})
            ON CONFLICT ("key") DO UPDATE SET
                "count" = CASE
                    WHEN "RateLimit"."expiresAt" <= ${now} THEN 1
                    ELSE "RateLimit"."count" + 1
                END,
                "expiresAt" = CASE
                    WHEN "RateLimit"."expiresAt" <= ${now} THEN ${expires}
                    ELSE "RateLimit"."expiresAt"
                END
            RETURNING "count", "expiresAt"
        `;

        const row = rows[0];
        if (!row) return ALLOW_ON_FAILURE;

        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((new Date(row.expiresAt).getTime() - now.getTime()) / 1000)
        );

        return {
            ok: row.count <= limit,
            remaining: Math.max(0, limit - row.count),
            retryAfterSeconds,
        };
    } catch (error) {
        console.error('Shared rate limit unavailable:', error);
        return ALLOW_ON_FAILURE;
    }
}

/**
 * Removes windows that have closed.
 *
 * Nothing depends on this running — a closed window is reused in place by the
 * statement above — so it is housekeeping rather than correctness, and it runs
 * from the weekly backup rather than on a request. Without it the table grows
 * one row per address that ever signed in.
 */
export async function sweepRateLimits(): Promise<number> {
    try {
        const removed = await prisma.rateLimit.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
        return removed.count;
    } catch {
        return 0;
    }
}

/**
 * Who a request is from, for the purpose of counting.
 *
 * Behind the platform's proxy the first hop of `x-forwarded-for` is the real
 * client. It lived in `rateLimit.ts`, which meant every caller of the shared
 * limiter imported from two modules to use one — seven routes doing the same
 * two-line dance. It lives here now and `rateLimit.ts` re-exports it for the
 * one route that still wants the soft count.
 */
export function clientKey(req: NextRequest, scope: string): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    return `${scope}:${ip}`;
}
