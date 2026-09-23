'use client';

import { useTranslations } from 'next-intl';
import { INBOX_SORTS, INBOX_STATES, type InboxQuery } from '@/lib/inboxFilter';

const chip = (active: boolean) =>
    `flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors ${
        active ? 'bg-ink text-page' : 'border border-control text-muted hover:border-ink hover:text-ink'
    }`;

/** Sideways on a phone, wrapping once there is room. */
const rail =
    '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden';

/**
 * Search, source, state and order for the inbox. Only the sources and states
 * that are actually in the list are offered, each with its count.
 */
export default function InboxFilters({
    query,
    onChange,
    sources,
    states,
    total,
}: {
    query: InboxQuery;
    onChange: (next: InboxQuery) => void;
    sources: { value: string; count: number }[];
    states: { value: string; count: number }[];
    total: number;
}) {
    const t = useTranslations('Inbox');
    const set = (patch: Partial<InboxQuery>) => onChange({ ...query, ...patch });
    const stateCount = (state: string) => states.find((entry) => entry.value === state)?.count ?? 0;

    return (
        <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <label className="flex min-w-0 flex-1 items-center gap-3 border-b border-line pb-2">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                        type="search"
                        value={query.search}
                        onChange={(event) => set({ search: event.target.value })}
                        placeholder={t('searchPlaceholder')}
                        aria-label={t('searchPlaceholder')}
                        className="w-full bg-transparent py-1 text-base outline-none placeholder:text-faint"
                    />
                </label>
                <select
                    value={query.sort}
                    onChange={(event) => set({ sort: event.target.value as InboxQuery['sort'] })}
                    aria-label={t('sortLabel')}
                    className="shrink-0 rounded-full border border-control bg-transparent px-3 py-1.5 text-sm text-muted outline-none focus:border-ink"
                >
                    {INBOX_SORTS.map((sort) => (
                        <option key={sort} value={sort}>
                            {t(`sort.${sort}`)}
                        </option>
                    ))}
                </select>
            </div>

            {sources.length > 1 && (
                <div className={rail} role="group" aria-label={t('filterSource')}>
                    <button type="button" onClick={() => set({ source: '' })} aria-pressed={!query.source} className={chip(!query.source)}>
                        {t('filterAll')}
                        <span className="tabular-nums text-xs opacity-60">{total}</span>
                    </button>
                    {sources.map((source) => (
                        <button
                            key={source.value}
                            type="button"
                            aria-pressed={query.source === source.value}
                            onClick={() => set({ source: query.source === source.value ? '' : source.value })}
                            className={chip(query.source === source.value)}
                        >
                            {t.has(`source.${source.value}`) ? t(`source.${source.value}`) : source.value}
                            <span className="tabular-nums text-xs opacity-60">{source.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {states.length > 1 && (
                <div className={rail} role="group" aria-label={t('filterStatus')}>
                    {INBOX_STATES.filter((state) => stateCount(state) > 0).map((state) => (
                        <button
                            key={state}
                            type="button"
                            aria-pressed={query.state === state}
                            onClick={() => set({ state: query.state === state ? '' : state })}
                            className={chip(query.state === state)}
                        >
                            {t(`status.${state}`)}
                            <span className="tabular-nums text-xs opacity-60">{stateCount(state)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
