import prisma from './prisma';
import { rememberModel } from './aiConfig';
import type { ModelReport } from './aiImport';
import { compareUsage, type UsagePurpose } from './tokenUsage';

/**
 * A model report that also writes the call down (see model AiUsage).
 *
 * The writes are collected rather than awaited one by one, and `flush` waits
 * for them: on a serverless function a promise nobody awaits may simply not
 * finish once the response is sent. A failed write never fails the call it
 * was about — the recipe matters more than the statistics.
 */
export function usageRecorder(purpose: UsagePurpose, context: { captureId?: number | null; source?: string | null } = {}) {
    const pending: Promise<unknown>[] = [];

    const report: ModelReport = (provider, model, usage) => {
        void rememberModel(provider, model);
        pending.push(
            prisma.aiUsage
                .create({
                    data: {
                        purpose,
                        provider,
                        model,
                        captureId: context.captureId ?? null,
                        source: context.source ?? null,
                        input: usage?.input ?? 0,
                        output: usage?.output ?? 0,
                    },
                })
                .catch(() => undefined)
        );
    };

    return {
        report,
        flush: () => Promise.all(pending),
    };
}

/**
 * One inbox item's tokens next to those of comparable items: the same
 * source (an Instagram post with Instagram posts), the last ninety days.
 */
export async function itemComparison(captureId: number) {
    const own = await prisma.aiUsage.findMany({
        where: { captureId },
        select: { purpose: true, model: true, input: true, output: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });
    const capture = await prisma.capture.findUnique({ where: { id: captureId }, select: { source: true } });
    const source = capture?.source ?? null;

    const since = new Date(Date.now() - 90 * 86_400_000);
    const grouped = await prisma.aiUsage.groupBy({
        by: ['captureId'],
        where: { source, createdAt: { gte: since }, captureId: { not: null, notIn: [captureId] } },
        _sum: { input: true, output: true },
        orderBy: { captureId: 'desc' },
        take: 300,
    });

    const others = grouped.map(
        (row: { _sum: { input: number | null; output: number | null } }) => (row._sum.input ?? 0) + (row._sum.output ?? 0)
    );

    return {
        source,
        calls: own.map((row: { purpose: string; model: string; input: number; output: number; createdAt: Date }) => ({
            purpose: row.purpose,
            model: row.model,
            input: row.input,
            output: row.output,
            at: row.createdAt.toISOString(),
        })),
        comparison: compareUsage(
            own.reduce((total: number, row: { input: number; output: number }) => total + row.input + row.output, 0),
            others
        ),
    };
}
