'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';

/**
 * The values are what is stored on the recipe and used in the query string;
 * only the labels are translated.
 */
const CATEGORY_VALUES = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack', 'Drink'] as const;
const CUISINE_VALUES = ['German', 'Italian', 'Asian', 'Mexican', 'French', 'Greek', 'Indian'] as const;

const selectClass =
    'py-1 border-b border-transparent bg-transparent text-gray-900 dark:text-white text-base font-medium outline-none cursor-pointer hover:border-gray-900 focus:border-gray-900 dark:hover:border-white transition-colors';
const optionClass = 'text-gray-900 dark:bg-black';
const legendClass = 'text-sm font-medium text-gray-500 uppercase tracking-widest';

export default function FilterBar({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
    const t = useTranslations('Home');
    const tCategory = useTranslations('Categories');
    const tCuisine = useTranslations('Cuisines');

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

    useEffect(() => {
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            const currentSearch = params.get('search') || '';

            if (searchTerm !== currentSearch) {
                if (searchTerm) params.set('search', searchTerm);
                else params.delete('search');
                router.replace(`${pathname}?${params.toString()}`);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, pathname, router, searchParams]);

    const setParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value);
        else params.delete(key);
        router.replace(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-8 items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 mt-4 mb-4 w-full">
            <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-grow">
                <input
                    type="search"
                    placeholder={t('searchPlaceholder')}
                    aria-label={t('searchPlaceholder')}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full sm:max-w-xs py-1 border-b border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white placeholder-gray-500 font-serif outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                />
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="sort" className={legendClass}>
                    {t('sortBy')}:
                </label>
                <select
                    id="sort"
                    className={selectClass}
                    onChange={(event) => setParam('sort', event.target.value)}
                    defaultValue={searchParams.get('sort') || 'recent'}
                >
                    <option value="recent" className={optionClass}>{t('sortRecent')}</option>
                    <option value="views" className={optionClass}>{t('sortViews')}</option>
                    <option value="rating" className={optionClass}>{t('sortRating')}</option>
                </select>
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="category" className={legendClass}>
                    {t('category')}:
                </label>
                <select
                    id="category"
                    className={selectClass}
                    onChange={(event) => setParam('category', event.target.value)}
                    defaultValue={searchParams.get('category') || ''}
                >
                    <option value="" className={optionClass}>{t('allCategories')}</option>
                    {CATEGORY_VALUES.map((value) => (
                        <option key={value} value={value} className={optionClass}>
                            {tCategory(value)}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="nationality" className={legendClass}>
                    {t('nationality')}:
                </label>
                <select
                    id="nationality"
                    className={selectClass}
                    onChange={(event) => setParam('nationality', event.target.value)}
                    defaultValue={searchParams.get('nationality') || ''}
                >
                    <option value="" className={optionClass}>{t('allNationalities')}</option>
                    {CUISINE_VALUES.map((value) => (
                        <option key={value} value={value} className={optionClass}>
                            {tCuisine(value)}
                        </option>
                    ))}
                </select>
            </div>

            {isLoggedIn && (
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="favoritesToggle"
                        onChange={(event) => setParam('favorites', event.target.checked ? 'true' : '')}
                        checked={searchParams.get('favorites') === 'true'}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label
                        htmlFor="favoritesToggle"
                        className="m-0 text-gray-900 dark:text-white text-sm font-medium cursor-pointer"
                    >
                        {t('favoritesOnly')}
                    </label>
                </div>
            )}
        </div>
    );
}
