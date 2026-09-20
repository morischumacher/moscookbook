import { NextRequest } from 'next/server';

interface Bucket {
    count: number;
    resetAt: number;
}

/**
 * In-memory fixed-window rate limiter.
 *
 * Note: on serverless each instance keeps its own counters, so this raises the
 * cost of brute-forcing considerably without being a hard global guarantee.
 * If the app ever needs a strict limit, swap the map for Redis/Upstash — the
 * call sites stay the same.
 */
const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

function prune(now: number) {
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

export interface RateLimitResult {
    ok: boolean;
    remaining: number;
    retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();

    if (buckets.size > MAX_TRACKED_KEYS) prune(now);

    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    bucket.count += 1;

    if (bucket.count > limit) {
        return {
            ok: false,
            remaining: 0,
            retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        };
    }

    return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Best-effort client identifier, behind Vercel's proxy this is the real client IP. */
export function clientKey(req: NextRequest, scope: string): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    return `${scope}:${ip}`;
}
