import { getLocale, getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import PageHeader from '@/components/admin/PageHeader';
import { pageContainer } from '@/lib/ui';
import { Link } from '@/i18n/routing';
import { aiCapability } from '@/lib/aiConfig';
import { listSiteProfiles } from '@/lib/siteProfileDb';
import { readReason } from '@/lib/captureReasons';
import { draftFromJson } from '@/lib/captureDraft';
import { hostOf } from '@/lib/siteProfile';
import { analyse, type CaptureFacts, type UsageRow } from '@/lib/tokenAnalytics';
import { shortTokens } from '@/lib/tokenUsage';

/** The last thirty days, and the thirty before them for "up or down". */
const DAYS = 30;

/**
 * Token analytics: what the AI calls cost, what for, and — first on the
 * page — what to do so they cost less. See lib/tokenAnalytics.ts.
 */
export default async function TokenUsagePage() {
    const t = await getTranslations('Tokens');
    const tInbox = await getTranslations('Inbox');
    const locale = await getLocale();
    const now = new Date();

    const rows: UsageRow[] = await prisma.aiUsage.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 2 * DAYS * 86_400_000) } },
        select: { createdAt: true, purpose: true, provider: true, model: true, captureId: true, source: true, input: true, output: true },
    });

    const ids = [...new Set(rows.map((row) => row.captureId).filter((id): id is number => id !== null))];
    const [captures, profiles, ai] = await Promise.all([
        prisma.capture.findMany({
            where: { id: { in: ids } },
            select: { id: true, error: true, source: true, sourceUrl: true, draft: true },
        }),
        listSiteProfiles().catch(() => []),
        aiCapability(),
    ]);

    const facts: CaptureFacts[] = captures.map(
        (capture: { id: number; error: string | null; source: string; sourceUrl: string | null; draft: unknown }) => ({
            id: capture.id,
            reason: readReason(capture.error)?.code ?? null,
            host: capture.source === 'web' && capture.sourceUrl ? hostOf(capture.sourceUrl) : null,
            title: draftFromJson(capture.draft)?.title || null,
        })
    );

    const data = analyse(rows, facts, {
        now,
        days: DAYS,
        mode: ai.mode,
        learnedHosts: profiles.map((profile) => profile.host),
    });

    const number = (value: number) => new Intl.NumberFormat(locale).format(value);
    const tokens = data.total.input + data.total.output;
    const change = data.previousTokens > 0 ? Math.round(((tokens - data.previousTokens) / data.previousTokens) * 100) : null;
    const sourceName = (source: string) => (tInbox.has(`source.${source}`) ? tInbox(`source.${source}`) : source);
    const purposeName = (purpose: string) => (t.has(`purpose.${purpose}`) ? t(`purpose.${purpose}`) : purpose);

    const maxDay = Math.max(...data.days.map((day) => day.tokens), 1);
    const maxPurpose = Math.max(...data.byPurpose.map((row) => row.tokens), 1);

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('title')} intro={t('intro')} />

            {/* The three numbers first: how much, how often, and which way. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line p-4">
                    <p className="text-xs uppercase tracking-widest text-muted">{t('tileTokens', { days: DAYS })}</p>
                    <p className="mt-1 text-3xl font-extrabold tracking-tight">{shortTokens(tokens, locale)}</p>
                    {change !== null && (
                        <p className="mt-1 text-sm text-muted">{t('change', { change: `${change > 0 ? '+' : ''}${change}` })}</p>
                    )}
                </div>
                <div className="rounded-xl border border-line p-4">
                    <p className="text-xs uppercase tracking-widest text-muted">{t('tileCalls')}</p>
                    <p className="mt-1 text-3xl font-extrabold tracking-tight">{number(data.total.calls)}</p>
                    {data.total.calls > 0 && (
                        <p className="mt-1 text-sm text-muted">{t('perCall', { tokens: number(Math.round(tokens / data.total.calls)) })}</p>
                    )}
                </div>
                <div className="col-span-2 rounded-xl border border-line p-4 sm:col-span-1">
                    <p className="text-xs uppercase tracking-widest text-muted">{t('tileSplit')}</p>
                    <p className="mt-1 text-lg font-bold">
                        {t('split', { input: shortTokens(data.total.input, locale), output: shortTokens(data.total.output, locale) })}
                    </p>
                    <p className="mt-1 text-sm text-muted">{t('splitHint')}</p>
                </div>
            </div>

            {/* What to do about it. Only what the numbers show, biggest first. */}
            <section className="mt-10">
                <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('adviceTitle')}</h2>
                {data.total.calls === 0 ? (
                    <p className="py-6 text-muted">{t('empty')}</p>
                ) : (
                    <ul className="divide-y divide-line">
                        {data.recommendations.map((advice) => (
                            <li key={advice.id} className="py-4">
                                <p className="font-bold">
                                    {t(`advice.${advice.id}.title`, { count: advice.count, detail: advice.detail })}
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-muted">
                                    {t(`advice.${advice.id}.do`, { count: advice.count, detail: advice.detail })}
                                </p>
                                {advice.tokens > 0 && (
                                    <p className="mt-1 text-xs text-accent-text">
                                        {t('about', { tokens: shortTokens(advice.tokens, locale), share: Math.round((advice.tokens / Math.max(tokens, 1)) * 100) })}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <details className="mt-2 rounded-xl border border-line p-4 text-sm">
                    <summary className="cursor-pointer font-bold">{t('rulesTitle')}</summary>
                    <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted">
                        <li>{t('rules.free')}</li>
                        <li>{t('rules.link')}</li>
                        <li>{t('rules.once')}</li>
                        <li>{t('rules.mode')}</li>
                        <li>{t('rules.model')}</li>
                        <li>{t('rules.learn')}</li>
                    </ul>
                </details>
            </section>

            {data.total.calls > 0 && (
                <>
                    {/* Per day. A bar each; hover says the day and the number. */}
                    <section className="mt-10">
                        <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('perDay')}</h2>
                        <svg viewBox="0 0 300 80" className="mt-4 h-24 w-full" role="img" aria-label={t('perDayLabel', { days: DAYS })} preserveAspectRatio="none">
                            <line x1={0} x2={300} y1={79.5} y2={79.5} className="stroke-current text-line" strokeWidth={1} />
                            {data.days.map((day, index) => {
                                const height = day.tokens === 0 ? 0 : Math.max(2, (day.tokens / maxDay) * 74);
                                const slot = 300 / data.days.length;
                                return (
                                    <g key={day.date}>
                                        <rect x={index * slot} y={0} width={slot} height={80} fill="transparent">
                                            <title>{`${day.date}: ${number(day.tokens)}`}</title>
                                        </rect>
                                        {height > 0 && (
                                            <rect x={index * slot + 1} y={80 - height} width={slot - 2} height={height} rx={1.5} className="fill-current text-accent">
                                                <title>{`${day.date}: ${number(day.tokens)}`}</title>
                                            </rect>
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                        <div className="mt-1 flex justify-between text-xs text-faint">
                            <span>{data.days[0]?.date}</span>
                            <span>{t('peak', { tokens: shortTokens(maxDay, locale) })}</span>
                            <span>{data.days[data.days.length - 1]?.date}</span>
                        </div>
                    </section>

                    {/* What for: one bar per purpose, labelled directly. */}
                    <section className="mt-10">
                        <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('byPurpose')}</h2>
                        <ul className="mt-4 space-y-3">
                            {data.byPurpose.map((row) => (
                                <li key={row.purpose} title={t('purposeTooltip', { calls: row.calls, median: number(row.medianPerCall) })}>
                                    <div className="flex justify-between gap-3 text-sm">
                                        <span>{purposeName(row.purpose)}</span>
                                        <span className="tabular-nums text-muted">
                                            {shortTokens(row.tokens, locale)} · {t('calls', { count: row.calls })}
                                        </span>
                                    </div>
                                    <div className="mt-1 h-2 rounded-full bg-surface">
                                        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (row.tokens / maxPurpose) * 100)}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="mt-10">
                        <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('bySource')}</h2>
                        <table className="mt-2 w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted">
                                    <th className="py-2 font-normal">{t('colSource')}</th>
                                    <th className="py-2 text-right font-normal">{t('colItems')}</th>
                                    <th className="py-2 text-right font-normal">{t('colMedian')}</th>
                                    <th className="py-2 text-right font-normal">{t('colTotal')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                {data.bySource.map((row) => (
                                    <tr key={row.source}>
                                        <td className="py-2">{sourceName(row.source)}</td>
                                        <td className="py-2 text-right tabular-nums">{row.items}</td>
                                        <td className="py-2 text-right tabular-nums">{shortTokens(row.medianPerItem, locale)}</td>
                                        <td className="py-2 text-right tabular-nums">{shortTokens(row.tokens, locale)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className="mt-10">
                        <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('byModel')}</h2>
                        <ul className="divide-y divide-line text-sm">
                            {data.byModel.map((row) => (
                                <li key={`${row.provider}/${row.model}`} className="flex justify-between gap-3 py-2">
                                    <span className="min-w-0 truncate">{row.model}</span>
                                    <span className="shrink-0 tabular-nums text-muted">
                                        {shortTokens(row.tokens, locale)} · {t('calls', { count: row.calls })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {data.topItems.length > 0 && (
                        <section className="mt-10">
                            <h2 className="border-b border-line pb-3 text-xs font-bold uppercase tracking-widest text-muted">{t('topItems')}</h2>
                            <ul className="divide-y divide-line text-sm">
                                {data.topItems.map((item) => (
                                    <li key={item.captureId} className="flex justify-between gap-3 py-2">
                                        <span className="min-w-0 truncate">
                                            {item.title || t('untitled')}
                                            {item.source && <span className="text-muted"> · {sourceName(item.source)}</span>}
                                        </span>
                                        <span className="shrink-0 tabular-nums text-muted">
                                            {shortTokens(item.tokens, locale)} · {t('calls', { count: item.calls })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <Link href="/admin/inbox" className="mt-3 inline-block text-sm underline underline-offset-4">
                                {t('toInbox')}
                            </Link>
                        </section>
                    )}
                </>
            )}
        </main>
    );
}
