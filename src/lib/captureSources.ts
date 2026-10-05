import prisma from './prisma';
import { hostOf } from './siteProfile';

/**
 * Where the cookbook's imports came from, and how each was read — so the
 * admin can see why a site was or was not learned (work #41): a web page
 * read by its recipe markup needs nothing learned and already costs nothing;
 * a photo of a book or a social post has no page layout to learn.
 */
export interface CaptureSource {
    /** A web host ("chefkoch.de"), or the channel ("photo", "instagram" …). */
    key: string;
    web: boolean;
    count: number;
    /** Read by rules alone (recipe markup, or a site already learned). */
    rules: number;
    /** A model read it, alone or helping. */
    ai: number;
    last: string;
    /** A page of it, for "Seite lernen". */
    example: string | null;
}

export function groupSources(rows: { source: string; sourceUrl: string | null; readBy: string | null; createdAt: Date }[]): CaptureSource[] {
    const groups = new Map<string, CaptureSource>();
    for (const row of rows) {
        const host = row.source === 'web' && row.sourceUrl ? hostOf(row.sourceUrl) : null;
        const key = host ?? row.source;
        const group = groups.get(key) ?? { key, web: host !== null, count: 0, rules: 0, ai: 0, last: row.createdAt.toISOString(), example: host ? row.sourceUrl : null };
        group.count += 1;
        if (row.readBy === 'rules') group.rules += 1;
        else if (row.readBy) group.ai += 1;
        if (row.createdAt.toISOString() > group.last) group.last = row.createdAt.toISOString();
        groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

export async function captureSources(): Promise<CaptureSource[]> {
    const rows = await prisma.capture.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: { source: true, sourceUrl: true, readBy: true, createdAt: true },
    });
    return groupSources(rows);
}
