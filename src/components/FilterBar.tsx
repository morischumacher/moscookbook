'use client';

import { Link, useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import styles from './FilterBar.module.css';

export default function FilterBar({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const params = new URLSearchParams(searchParams);
        params.set('sort', e.target.value);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleFilterChange = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleFavoritesToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const params = new URLSearchParams(searchParams);
        if (e.target.checked) {
            params.set('favorites', 'true');
        } else {
            params.delete('favorites');
        }
        router.replace(`${pathname}?${params.toString()}`);
    };

    return (
        <div className={styles.filterBar}>
            <div className={styles.group}>
                <label>Sort by:</label>
                <select onChange={handleSortChange} defaultValue={searchParams.get('sort') || 'recent'}>
                    <option value="recent">Recently Uploaded</option>
                    <option value="views">Most Viewed</option>
                    <option value="rating">Best Rated</option>
                </select>
            </div>

            <div className={styles.group}>
                <label>Category:</label>
                <select onChange={(e) => handleFilterChange('category', e.target.value)} defaultValue={searchParams.get('category') || ''}>
                    <option value="">All Categories</option>
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                    <option value="Dessert">Dessert</option>
                </select>
            </div>

            <div className={styles.group}>
                <label>Nationality:</label>
                <select onChange={(e) => handleFilterChange('nationality', e.target.value)} defaultValue={searchParams.get('nationality') || ''}>
                    <option value="">All Nationalities</option>
                    <option value="Italian">Italian</option>
                    <option value="German">German</option>
                    <option value="Asian">Asian</option>
                    <option value="Mexican">Mexican</option>
                </select>
            </div>

            {isLoggedIn && (
                <div className={styles.group} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        id="favoritesToggle"
                        onChange={handleFavoritesToggle}
                        checked={searchParams.get('favorites') === 'true'}
                    />
                    <label htmlFor="favoritesToggle" style={{ marginBottom: 0 }}>Favorites Only</label>
                </div>
            )}
        </div>
    );
}
