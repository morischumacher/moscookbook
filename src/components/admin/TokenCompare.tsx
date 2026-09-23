'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { UsageComparison } from '@/lib/tokenUsage';

interface Answer {
    source: string | null;
    calls: { purpose: string; model: string; input: number; output: number; at: string }[];
    comparison: UsageComparison;
}

/**
 * What reading one inbox item cost, next to comparable items.
 *
 * A dot per comparable item (the same source, the last ninety days) on one
 * line, the median marked, this one drawn larger in the accent colour. One
 * series, so no legend: the sentence above it says what the dots are. Each
 * dot has a tooltip with its exact number.
 */
export default function TokenCompare({ captureId }: { captureId: number }) {
    const t = useTranslations('Tokens');
    const tInbox = useTranslations('Inbox');
    const locale = useLocale();
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        fetch(`/api/capture/${captureId}/tokens`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((data: Answer) => setAnswer(data))
            .catch(() => setFailed(true));
    }, [captureId]);

    const number = (value: number) => new Intl.NumberFormat(locale).format(value);

    if (failed) return <p className="mt-3 text-sm text-muted">{t('loadFailed')}</p>;
    if (!answer) return <p className="mt-3 text-sm text-faint">{t('loading')}</p>;

    const { comparison, calls } = answer;
    const sourceName = answer.source && tInbox.has(`source.${answer.source}`) ? tInbox(`source.${answer.source}`) : answer.source ?? '';

    // One scale for all dots, from nothing to the largest, with a little room.
    const top = Math.max(comparison.own, ...comparison.others, comparison.median ?? 0, 1) * 1.05;
    const width = 320;
    const x = (value: number) => 8 + (value / top) * (width - 16);

    return (
        <div className="mt-3 rounded-xl border border-line p-3 text-sm">
            <p>
                {t('own', { tokens: number(comparison.own), calls: calls.length })}
                {comparison.median !== null && (
                    <>
                        {' · '}
                        {t('median', { tokens: number(comparison.median), count: comparison.others.length, source: sourceName })}
                        {comparison.ratio !== null && (
                            <span className={comparison.ratio > 1.5 ? 'font-semibold text-accent-text' : 'text-muted'}>
                                {' '}
                                ({t('ratio', { ratio: new Intl.NumberFormat(locale).format(comparison.ratio) })})
                            </span>
                        )}
                    </>
                )}
            </p>

            {comparison.others.length === 0 ? (
                <p className="mt-2 text-muted">{t('nothingToCompare', { source: sourceName })}</p>
            ) : (
                <svg
                    viewBox={`0 0 ${width} 44`}
                    className="mt-3 h-11 w-full max-w-sm"
                    role="img"
                    aria-label={t('plotLabel', { tokens: number(comparison.own), median: number(comparison.median ?? 0) })}
                >
                    {/* The baseline, recessive. */}
                    <line x1={8} x2={width - 8} y1={22} y2={22} className="stroke-current text-line" strokeWidth={1} />

                    {comparison.others.map((value, index) => (
                        <circle key={index} cx={x(value)} cy={22} r={4} className="fill-current text-control" opacity={0.55}>
                            <title>{t('dot', { tokens: number(value) })}</title>
                        </circle>
                    ))}

                    {comparison.median !== null && (
                        <g>
                            <line x1={x(comparison.median)} x2={x(comparison.median)} y1={10} y2={34} className="stroke-current text-muted" strokeWidth={2} />
                            <text x={x(comparison.median)} y={8} textAnchor="middle" className="fill-current text-muted" fontSize={9}>
                                {t('medianShort')}
                            </text>
                        </g>
                    )}

                    {/* This one, larger, with a ring of the page colour so it
                        stands off the dots it sits on. */}
                    <circle cx={x(comparison.own)} cy={22} r={6.5} className="fill-current stroke-current text-accent" strokeWidth={0}>
                        <title>{t('dotOwn', { tokens: number(comparison.own) })}</title>
                    </circle>
                    <circle cx={x(comparison.own)} cy={22} r={6.5} fill="none" className="stroke-current text-page" strokeWidth={2} />
                    <text x={x(comparison.own)} y={42} textAnchor="middle" className="fill-current text-ink" fontSize={9}>
                        {t('thisOne')}
                    </text>
                </svg>
            )}

            {calls.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                    {calls.map((call, index) => (
                        <li key={index}>
                            {t(`purpose.${call.purpose}`)} · {call.model} · {t('inOut', { input: number(call.input), output: number(call.output) })}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
