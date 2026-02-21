'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';

export default function FilterBar({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

    useEffect(() => {
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());
            const currentSearch = params.get('search') || '';

            if (searchTerm !== currentSearch) {
                if (searchTerm) {
                    params.set('search', searchTerm);
                } else {
                    params.delete('search');
                }
                router.replace(`${pathname}?${params.toString()}`);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchTerm, pathname, router, searchParams]);

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('sort', e.target.value);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleFilterChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleFavoritesToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.checked) {
            params.set('favorites', 'true');
        } else {
            params.delete('favorites');
        }
        router.replace(`${pathname}?${params.toString()}`);
    };

    return (
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-8 items-start sm:items-center border-b border-gray-200 dark:border-gray-800 pb-3 mt-4 mb-4 w-full">
            {/* Search Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-grow">
                <input
                    type="text"
                    placeholder="Search recipes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:max-w-xs py-1 border-b border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white placeholder-gray-500 font-serif outline-none focus:border-gray-900 dark:focus:border-white transition-colors"
                />
            </div>

            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-widest">Sort by:</label>
                <select
                    className="py-1 border-b border-transparent bg-transparent text-gray-900 dark:text-white text-base font-medium outline-none cursor-pointer hover:border-gray-900 focus:border-gray-900 dark:hover:border-white transition-colors"
                    onChange={handleSortChange}
                    defaultValue={searchParams.get('sort') || 'recent'}
                >
                    <option value="recent" className="text-gray-900 dark:bg-black">Recently Uploaded</option>
                    <option value="views" className="text-gray-900 dark:bg-black">Most Viewed</option>
                    <option value="rating" className="text-gray-900 dark:bg-black">Best Rated</option>
                </select>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-widest">Category:</label>
                <select
                    className="py-1 border-b border-transparent bg-transparent text-gray-900 dark:text-white text-base font-medium outline-none cursor-pointer hover:border-gray-900 focus:border-gray-900 dark:hover:border-white transition-colors"
                    onChange={(e) => handleFilterChange('category', e.target.value)}
                    defaultValue={searchParams.get('category') || ''}
                >
                    <option value="" className="text-gray-900 dark:bg-black">All Categories</option>
                    <option value="Breakfast" className="text-gray-900 dark:bg-black">Breakfast</option>
                    <option value="Lunch" className="text-gray-900 dark:bg-black">Lunch</option>
                    <option value="Dinner" className="text-gray-900 dark:bg-black">Dinner</option>
                    <option value="Dessert" className="text-gray-900 dark:bg-black">Dessert</option>
                </select>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-500 uppercase tracking-widest">Nationality:</label>
                <select
                    className="py-1 border-b border-transparent bg-transparent text-gray-900 dark:text-white text-base font-medium outline-none cursor-pointer hover:border-gray-900 focus:border-gray-900 dark:hover:border-white transition-colors"
                    onChange={(e) => handleFilterChange('nationality', e.target.value)}
                    defaultValue={searchParams.get('nationality') || ''}
                >
                    <option value="" className="text-gray-900 dark:bg-black">All Nationalities</option>
                    <option value="Italian" className="text-gray-900 dark:bg-black">Italian</option>
                    <option value="German" className="text-gray-900 dark:bg-black">German</option>
                    <option value="Asian" className="text-gray-900 dark:bg-black">Asian</option>
                    <option value="Mexican" className="text-gray-900 dark:bg-black">Mexican</option>
                </select>
            </div>

            {isLoggedIn && (
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="favoritesToggle"
                        onChange={handleFavoritesToggle}
                        checked={searchParams.get('favorites') === 'true'}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="favoritesToggle" className="m-0 text-gray-900 dark:text-white text-sm font-medium cursor-pointer">Favorites Only</label>
                </div>
            )}
        </div>
    );
}
