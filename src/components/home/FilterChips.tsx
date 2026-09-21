'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';

export interface FacetValue {
    value: string;
    count: number;
}

/**
 * Replaces four select boxes with what the collection actually contains.
 *
 * The old filter bar offered a fixed list — categories nobody had used were
 * shown, hand-typed ones were missing. These come from the data, so the filters
 * can never point at an empty result.
 */
export default function FilterChips({
    categories,
    cuisines,
    isLoggedIn,
    total,
}: {
    categories: FacetValue[];
    cuisines: FacetValue[];
    isLoggedIn: boolean;
    total: number;
}) {
    const t = useTranslations('Home');
    const tCategory = useTranslations('Categories');
    const tCuisine = useTranslations('Cuisines');

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') ?? '');
    const [haveTerm, setHaveTerm] = useState(searchParams.get('have') ?? '');

    const activeCategory = searchParams.get('category') ?? '';
    const activeCuisine = searchParams.get('nationality') ?? '';
    const activeSort = searchParams.get('sort') ?? 'recent';
    const favoritesOnly = searchParams.get('favorites') === 'true';

    const hasFilters = Boolean(
        activeCategory || activeCuisine || favoritesOnly || searchParams.get('search') ||
        searchParams.get('have')
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (searchTerm === (params.get('search') ?? '')) return;

            if (searchTerm) params.set('search', searchTerm);
            else params.delete('search');
            router.replace(`${pathname}?${params.toString()}`);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, pathname, router, searchParams]);

    // The same debounce, for the other question. Kept as its own effect rather
    // than one that syncs both, because two fields sharing one timer means
    // typing in either resets the other's.
    useEffect(() => {
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (haveTerm === (params.get('have') ?? '')) return;

            if (haveTerm) params.set('have', haveTerm);
            else params.delete('have');
            router.replace(`${pathname}?${params.toString()}`);
        }, 300);

        return () => clearTimeout(timer);
    }, [haveTerm, pathname, router, searchParams]);

    const setParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const clearAll = () => {
        setSearchTerm('');
        setHaveTerm('');
        router.replace(pathname);
    };

    /**
     * One shape for every filter.
     *
     * Categories were pills and cuisines were underlined words, which read as
     * two unrelated controls stacked on top of each other. They do the same
     * thing, so they look the same.
     */
    const chipClass = (active: boolean) =>
        `flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition-colors ${active
            ? 'bg-ink text-page'
            : 'border border-control text-muted hover:border-ink hover:text-ink'
        }`;

    /** A row of chips that scrolls sideways rather than wrapping on a phone. */
    const railClass =
        '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden';

    const label = (
        translate: ReturnType<typeof useTranslations>,
        value: string
    ) => (translate.has(value) ? translate(value) : value);

    return (
        <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 border-b border-line pb-2">
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-faint"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchPlaceholder')}
                    className="w-full bg-transparent py-1 text-base outline-none placeholder:text-faint"
                />
            </label>

            {/*
                A second field, not a mode of the first. They ask different
                questions and give different answers: the search box ranks, so
                two words can both be half-matched, while this one requires
                every ingredient named — because "you have half of it" is not an
                answer to "can I cook this tonight". Sharing one box would mean
                guessing which of the two somebody meant.
            */}
            <label className="flex items-center gap-3 border-b border-line pb-2">
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-faint"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M4 20V10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10z" />
                    <path d="M3 20h18" />
                </svg>
                <input
                    type="search"
                    value={haveTerm}
                    onChange={(event) => setHaveTerm(event.target.value)}
                    placeholder={t('havePlaceholder')}
                    aria-label={t('haveLabel')}
                    className="w-full bg-transparent py-1 text-base outline-none placeholder:text-faint"
                />
            </label>

            {/* Horizontal scroll rather than wrapping, so a long list stays one line on a phone. */}
            {categories.length > 0 && (
                <div className={railClass} role="group" aria-label={t('category')}>
                    <button type="button" onClick={() => setParam('category', '')} className={chipClass(!activeCategory)}>
                        {t('allCategories')}
                        <span className="tabular-nums text-xs opacity-60">{total}</span>
                    </button>
                    {categories.map((facet) => (
                        <button
                            key={facet.value}
                            type="button"
                            onClick={() => setParam('category', activeCategory === facet.value ? '' : facet.value)}
                            className={chipClass(activeCategory === facet.value)}
                        >
                            {label(tCategory, facet.value)}
                            <span className="tabular-nums text-xs opacity-60">{facet.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {/*
                No "all cuisines" chip. The category rail has one because its
                count says how big the collection is; a second filled pill
                directly underneath only competed with it. An active chip
                switches itself off when tapped, and "clear filters" appears
                below as soon as anything is set.
            */}
            {cuisines.length > 0 && (
                <div className={railClass} role="group" aria-label={t('nationality')}>
                    {cuisines.map((facet) => (
                        <button
                            key={facet.value}
                            type="button"
                            onClick={() =>
                                setParam('nationality', activeCuisine === facet.value ? '' : facet.value)
                            }
                            className={chipClass(activeCuisine === facet.value)}
                        >
                            {label(tCuisine, facet.value)}
                            <span className="tabular-nums text-xs opacity-60">{facet.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {/*
                Stacked on a phone, side by side once there is room. The old
                version pushed this group right with ml-auto, which on a narrow
                screen left it hanging off the end of a wrapped row.
            */}
            <div className="flex flex-col gap-3 border-t border-line pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                {isLoggedIn ? (
                    <button
                        type="button"
                        onClick={() => setParam('favorites', favoritesOnly ? '' : 'true')}
                        aria-pressed={favoritesOnly}
                        className={`self-start underline-offset-4 transition-colors ${favoritesOnly
                            ? 'font-medium text-ink underline'
                            : 'text-muted hover:text-ink'
                            }`}
                    >
                        {t('favoritesOnly')}
                    </button>
                ) : (
                    <span />
                )}

                <label className="flex items-center gap-2">
                    <span className="text-muted">{t('sortBy')}</span>
                    <select
                        value={activeSort}
                        onChange={(event) => setParam('sort', event.target.value)}
                        className="cursor-pointer rounded border border-control bg-transparent px-2 py-1 text-ink outline-none focus-visible:border-ink"
                    >
                        <option value="recent">{t('sortRecent')}</option>
                        <option value="views">{t('sortViews')}</option>
                        <option value="rating">{t('sortRating')}</option>
                    </select>
                </label>
            </div>

            {hasFilters && (
                <button
                    type="button"
                    onClick={clearAll}
                    className="self-start text-sm text-muted underline underline-offset-4 hover:text-ink"
                >
                    {t('clearFilters')}
                </button>
            )}
        </div>
    );
}
