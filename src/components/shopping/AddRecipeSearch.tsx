'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ShoppingItemRow } from '@/lib/shoppingDb';
import { buttonSecondary } from '@/lib/ui';

interface Found {
    id: number;
    title: string;
    servings: number | null;
    translations: { locale: string; title: string }[];
}

/**
 * Finding a recipe by its name and putting it on this list, from the list's
 * own "recipes on the list" — no detour to the recipe's page. At the
 * recipe's own servings; the recipe page's stepper is there for more.
 */
export default function AddRecipeSearch({ listId, onAdded }: { listId: number; onAdded: (items: ShoppingItemRow[], title: string) => void }) {
    const t = useTranslations('Shopping');
    const locale = useLocale() as 'de' | 'en';
    const [query, setQuery] = useState('');
    const [found, setFound] = useState<Found[] | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);

    // A moment after the last key, not on every one.
    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- too short to search for: nothing shown
            setFound(null);
            return;
        }
        let stale = false;
        const timer = setTimeout(async () => {
            const res = await fetch(`/api/shopping/recipes?q=${encodeURIComponent(q)}`).catch(() => null);
            if (stale || !res?.ok) return;
            setFound(((await res.json()) as { recipes: Found[] }).recipes);
        }, 200);
        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [query]);

    const titleOf = (recipe: Found) => recipe.translations.find((row) => row.locale === locale)?.title || recipe.title;

    const add = async (recipe: Found) => {
        setBusy(recipe.id);
        setFailed(false);
        const res = await fetch(`/api/shopping?list=${listId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipeId: recipe.id, servings: recipe.servings, locale }),
        }).catch(() => null);
        setBusy(null);
        if (!res?.ok) {
            setFailed(true);
            return;
        }
        setQuery('');
        onAdded(((await res.json()) as { items: ShoppingItemRow[] }).items, titleOf(recipe));
    };

    return (
        <div className="mt-5 border-t border-line pt-4">
            <label htmlFor="add-recipe" className="text-xs font-bold uppercase tracking-widest text-muted">
                {t('addRecipeTitle')}
            </label>
            <input
                id="add-recipe"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('addRecipeSearch')}
                autoComplete="off"
                className="mt-2 w-full rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
            />
            {found && (
                <ul className="mt-1 divide-y divide-line" aria-live="polite">
                    {found.length === 0 && <li className="py-3 text-sm text-faint">{t('addRecipeNone')}</li>}
                    {found.map((recipe) => (
                        <li key={recipe.id} className="flex min-h-12 items-center justify-between gap-3">
                            <span className="min-w-0">{titleOf(recipe)}</span>
                            <button type="button" disabled={busy !== null} onClick={() => void add(recipe)} className={buttonSecondary}>
                                {t('addRecipeOne')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {failed && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {t('failed')}
                </p>
            )}
        </div>
    );
}
