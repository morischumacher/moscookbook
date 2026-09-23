import { median } from './tokenUsage';

/**
 * The token dashboard, computed.
 *
 * Pure, so the numbers and — more importantly — the recommendations can be
 * tested without a database. The page reads the rows and hands them in.
 *
 * The recommendations are the point of the page. A total is a fact; "eleven
 * calls went to posts whose recipe was in the bio" is something to do
 * differently tomorrow. Each one is only made when the data shows it, and
 * says how many tokens it is about, so the biggest lever is the first one.
 */

export interface UsageRow {
    createdAt: Date;
    purpose: string;
    provider: string;
    model: string;
    captureId: number | null;
    source: string | null;
    input: number;
    output: number;
}

export interface CaptureFacts {
    id: number;
    /** The reason code it ended with (`noRecipe`, `recipeInBio` …), if any. */
    reason: string | null;
    /** The web host it came from, for "learn this site". */
    host: string | null;
    title: string | null;
}

export type RecommendationId =
    | 'noRecipe'
    | 'repeats'
    | 'learnSite'
    | 'videos'
    | 'aiOnly'
    | 'smallerModel'
    | 'modeImages'
    | 'fine';

export interface Recommendation {
    id: RecommendationId;
    /** Tokens this is about — what following it would have saved, roughly. */
    tokens: number;
    count: number;
    /** A host list, a model name, a ratio: whatever the sentence needs. */
    detail: string;
}

export interface Analytics {
    total: { input: number; output: number; calls: number };
    /** The same length of time before, for "up / down". */
    previousTokens: number;
    days: { date: string; tokens: number }[];
    byPurpose: { purpose: string; calls: number; tokens: number; medianPerCall: number }[];
    bySource: { source: string; items: number; tokens: number; medianPerItem: number }[];
    byModel: { provider: string; model: string; calls: number; tokens: number }[];
    topItems: { captureId: number; title: string | null; source: string | null; calls: number; tokens: number }[];
    recommendations: Recommendation[];
}

const NO_RECIPE_REASONS = new Set(['noRecipe', 'recipeInBio', 'recipeInComments', 'recipeByDm']);

/** Models that cost several times what a small one does per token. */
const LARGE_MODEL = /opus|sonnet|gpt-5(?!.*(mini|nano))|gpt-4o(?!-mini)|gpt-4\.1(?!-(mini|nano))|gemini-[\d.]+-pro/i;

const SMALL_ALTERNATIVE: Record<string, string> = {
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-5-mini',
    google: 'gemini-2.5-flash',
};

const tokensOf = (row: { input: number; output: number }) => row.input + row.output;
const sum = (rows: UsageRow[]) => rows.reduce((total, row) => total + tokensOf(row), 0);

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const name = key(item);
        groups.set(name, [...(groups.get(name) ?? []), item]);
    }
    return groups;
}

/** Tokens per inbox item, over every call made for it. */
function perItem(rows: UsageRow[]): Map<number, { tokens: number; calls: number; source: string | null }> {
    const items = new Map<number, { tokens: number; calls: number; source: string | null }>();
    for (const row of rows) {
        if (row.captureId === null) continue;
        const item = items.get(row.captureId) ?? { tokens: 0, calls: 0, source: row.source };
        item.tokens += tokensOf(row);
        item.calls += 1;
        items.set(row.captureId, item);
    }
    return items;
}

export function analyse(
    rows: UsageRow[],
    captures: CaptureFacts[],
    context: { now: Date; days: number; mode: string; learnedHosts: string[] }
): Analytics {
    const from = new Date(context.now.getTime() - context.days * 86_400_000);
    const before = new Date(from.getTime() - context.days * 86_400_000);
    const recent = rows.filter((row) => row.createdAt >= from);
    const previous = rows.filter((row) => row.createdAt >= before && row.createdAt < from);

    const days: Analytics['days'] = [];
    for (let offset = context.days - 1; offset >= 0; offset -= 1) {
        const day = new Date(context.now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
        days.push({ date: day, tokens: 0 });
    }
    const dayIndex = new Map(days.map((day, index) => [day.date, index]));
    for (const row of recent) {
        const index = dayIndex.get(row.createdAt.toISOString().slice(0, 10));
        if (index !== undefined) days[index].tokens += tokensOf(row);
    }

    const byPurpose = [...groupBy(recent, (row) => row.purpose)]
        .map(([purpose, group]) => ({
            purpose,
            calls: group.length,
            tokens: sum(group),
            medianPerCall: median(group.map(tokensOf)) ?? 0,
        }))
        .sort((a, b) => b.tokens - a.tokens);

    const items = perItem(recent);
    const bySource = [...groupBy([...items.values()], (item) => item.source ?? 'other')]
        .map(([source, group]) => ({
            source,
            items: group.length,
            tokens: group.reduce((total, item) => total + item.tokens, 0),
            medianPerItem: median(group.map((item) => item.tokens)) ?? 0,
        }))
        .sort((a, b) => b.tokens - a.tokens);

    const byModel = [...groupBy(recent, (row) => `${row.provider}\u0000${row.model}`)]
        .map(([name, group]) => {
            const [provider, model] = name.split('\u0000');
            return { provider, model, calls: group.length, tokens: sum(group) };
        })
        .sort((a, b) => b.tokens - a.tokens);

    const facts = new Map(captures.map((capture) => [capture.id, capture]));
    const topItems = [...items]
        .map(([captureId, item]) => ({ captureId, title: facts.get(captureId)?.title ?? null, ...item }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 5);

    const total = {
        input: recent.reduce((value, row) => value + row.input, 0),
        output: recent.reduce((value, row) => value + row.output, 0),
        calls: recent.length,
    };

    return {
        total,
        previousTokens: sum(previous),
        days,
        byPurpose,
        bySource,
        byModel,
        topItems,
        recommendations: recommend(recent, items, facts, byPurpose, bySource, byModel, context),
    };
}

function recommend(
    recent: UsageRow[],
    items: Map<number, { tokens: number; calls: number; source: string | null }>,
    facts: Map<number, CaptureFacts>,
    byPurpose: Analytics['byPurpose'],
    bySource: Analytics['bySource'],
    byModel: Analytics['byModel'],
    context: { mode: string; learnedHosts: string[] }
): Recommendation[] {
    const found: Recommendation[] = [];
    const all = recent.reduce((total, row) => total + tokensOf(row), 0);
    if (all === 0) return [];

    // Paid for, and there was never a recipe to find.
    const wasted = [...items].filter(([id]) => NO_RECIPE_REASONS.has(facts.get(id)?.reason ?? ''));
    if (wasted.length >= 2) {
        found.push({
            id: 'noRecipe',
            count: wasted.length,
            tokens: wasted.reduce((total, [, item]) => total + item.tokens, 0),
            detail: '',
        });
    }

    // The same item read by a model again and again.
    const readOften = [...items.values()].filter((item) => item.calls >= 3);
    if (readOften.length >= 1) {
        found.push({
            id: 'repeats',
            count: readOften.length,
            tokens: readOften.reduce((total, item) => total + item.tokens, 0),
            detail: '',
        });
    }

    // Sites a model read more than once that could have been learned.
    const learned = new Set(context.learnedHosts);
    const perHost = groupBy(
        [...items].filter(([id]) => {
            const host = facts.get(id)?.host;
            return host && !learned.has(host);
        }),
        ([id]) => facts.get(id)?.host ?? ''
    );
    const learnable = [...perHost].filter(([, group]) => group.length >= 2);
    if (learnable.length > 0) {
        found.push({
            id: 'learnSite',
            count: learnable.length,
            tokens: learnable.reduce((total, [, group]) => total + group.reduce((value, [, item]) => value + item.tokens, 0), 0),
            detail: learnable.map(([host]) => host).slice(0, 3).join(', '),
        });
    }

    // Videos: the subtitles are long.
    const videos = bySource.find((row) => row.source === 'youtube');
    const others = median(bySource.filter((row) => row.source !== 'youtube').map((row) => row.medianPerItem));
    if (videos && videos.items >= 3 && others && videos.medianPerItem > others * 2) {
        found.push({
            id: 'videos',
            count: videos.items,
            tokens: videos.tokens,
            detail: String(Math.round(videos.medianPerItem / others)),
        });
    }

    // "Read with AI only" against "read with AI".
    const alone = byPurpose.find((row) => row.purpose === 'aiOnly');
    const helped = byPurpose.find((row) => row.purpose === 'askAi' || row.purpose === 'capture');
    if (alone && helped && alone.calls >= 2 && helped.medianPerCall > 0 && alone.medianPerCall > helped.medianPerCall * 1.5) {
        found.push({
            id: 'aiOnly',
            count: alone.calls,
            tokens: alone.tokens,
            detail: (Math.round((alone.medianPerCall / helped.medianPerCall) * 10) / 10).toString(),
        });
    }

    // A large model doing most of the work.
    const large = byModel.find((row) => LARGE_MODEL.test(row.model));
    if (large && large.tokens > all * 0.3) {
        found.push({
            id: 'smallerModel',
            count: large.calls,
            tokens: large.tokens,
            detail: `${large.model} → ${SMALL_ALTERNATIVE[large.provider] ?? '…'}`,
        });
    }

    // Asked automatically on every short share.
    const automatic = recent.filter((row) => row.purpose === 'capture').reduce((total, row) => total + tokensOf(row), 0);
    if (context.mode === 'always' && automatic > all * 0.5) {
        found.push({ id: 'modeImages', count: 0, tokens: automatic, detail: '' });
    }

    found.sort((a, b) => b.tokens - a.tokens);
    return found.length > 0 ? found : [{ id: 'fine', count: 0, tokens: 0, detail: '' }];
}
