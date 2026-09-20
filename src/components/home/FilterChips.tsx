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

    const activeCategory = searchParams.get('category') ?? '';
    const activeCuisine = searchParams.get('nationality') ?? '';
    const activeSort = searchParams.get('sort') ?? 'recent';
    const favoritesOnly = searchParams.get('favorites') === 'true';

    const hasFilters = Boolean(
        activeCategory || activeCuisine || favoritesOnly || searchParams.get('search')
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

    const setParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const clearAll = () => {
        setSearchTerm('');
        router.replace(pathname);
    };

    const chipClass = (active: boolean) =>
        `flex h-10 shrink-0 items-center rounded-full px-4 text-sm transition-colors ${active
            ? 'bg-ink text-page'
            : 'border border-line text-muted hover:border-ink hover:text-ink'
        }`;

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

            {/* Horizontal scroll rather than wrapping, so a long list stays one line on a phone. */}
            {categories.length > 0 && (
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
                    <button type="button" onClick={() => setParam('category', '')} className={chipClass(!activeCategory)}>
                        {t('allCategories')}
                        <span className="ml-1.5 opacity-60">{total}</span>
                    </button>
                    {categories.map((facet) => (
                        <button
                            key={facet.value}
                            type="button"
                            onClick={() => setParam('category', activeCategory === facet.value ? '' : facet.value)}
                            className={chipClass(activeCategory === facet.value)}
                        >
                            {label(tCategory, facet.value)}
                            <span className="ml-1.5 opacity-60">{facet.count}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
                {cuisines.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-widest text-faint">
                            {t('nationality')}
                        </span>
                        {cuisines.map((facet) => (
                            <button
                                key={facet.value}
                                type="button"
                                onClick={() =>
                                    setParam('nationality', activeCuisine === facet.value ? '' : facet.value)
                                }
                                className={`underline-offset-4 transition-colors ${activeCuisine === facet.value
                                    ? 'text-ink underline'
                                    : 'text-muted hover:text-ink'
                                    }`}
                            >
                                {label(tCuisine, facet.value)}
                            </button>
                        ))}
                    </div>
                )}

                <div className="ml-auto flex items-center gap-4">
                    {isLoggedIn && (
                        <button
                            type="button"
                            onClick={() => setParam('favorites', favoritesOnly ? '' : 'true')}
                            aria-pressed={favoritesOnly}
                            className={`underline-offset-4 transition-colors ${favoritesOnly
                                ? 'text-ink underline'
                                : 'text-muted hover:text-ink'
                                }`}
                        >
                            {t('favoritesOnly')}
                        </button>
                    )}

                    <label className="flex items-center gap-2 text-muted">
                        <span className="text-xs uppercase tracking-widest text-faint">{t('sortBy')}</span>
                        <select
                            value={activeSort}
                            onChange={(event) => setParam('sort', event.target.value)}
                            className="cursor-pointer bg-transparent text-ink outline-none"
                        >
                            <option value="recent">{t('sortRecent')}</option>
                            <option value="views">{t('sortViews')}</option>
                            <option value="rating">{t('sortRating')}</option>
                        </select>
                    </label>
                </div>
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
