'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import type { ShoppingItem, ShoppingSource } from '@/lib/shoppingList';
import { useShoppingSelection } from './useShoppingSelection';

export default function ShoppingListView({
    items,
    recipes,
}: {
    items: ShoppingItem[];
    recipes: ShoppingSource[];
}) {
    const t = useTranslations('ShoppingList');
    const router = useRouter();
    const { toggle, clear } = useShoppingSelection();

    const [checked, setChecked] = useState<Set<string>>(new Set());

    const toggleItem = (key: string) => {
        setChecked((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const removeRecipe = (recipeId: number) => {
        toggle(recipeId);
        const remaining = recipes
            .filter((recipe) => recipe.recipeId !== recipeId)
            .map((recipe) => recipe.recipeId);
        router.replace(remaining.length > 0 ? `/shopping-list?r=${remaining.join(',')}` : '/shopping-list');
    };

    const clearAll = () => {
        clear();
        router.replace('/shopping-list');
    };

    const remaining = items.length - checked.size;

    return (
        <>
            <section className="print:hidden flex flex-wrap items-center gap-2 border-b border-line py-4">
                {recipes.map((recipe) => (
                    <span
                        key={recipe.recipeId}
                        className="flex h-9 items-center gap-2 rounded-full border border-line pl-3 pr-1 text-sm"
                    >
                        <Link href={`/recipe/${recipe.slug}`} className="underline-offset-4 hover:underline">
                            {recipe.title}
                        </Link>
                        <button
                            type="button"
                            onClick={() => removeRecipe(recipe.recipeId)}
                            aria-label={t('removeRecipe', { title: recipe.title })}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-faint hover:text-danger"
                        >
                            ×
                        </button>
                    </span>
                ))}
            </section>

            <p className="print:hidden py-4 text-xs uppercase tracking-widest text-faint">
                {t('remaining', { count: remaining })}
            </p>

            <ul className="divide-y divide-line">
                {items.map((item) => {
                    const isChecked = checked.has(item.key);
                    return (
                        <li key={item.key}>
                            <label className="flex cursor-pointer items-baseline gap-3 py-3">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleItem(item.key)}
                                    className="print:hidden mt-1 h-5 w-5 shrink-0 cursor-pointer accent-black"
                                />
                                <span
                                    className={`flex flex-1 flex-wrap items-baseline gap-x-3 transition-opacity ${isChecked ? 'opacity-40 line-through' : ''
                                        }`}
                                >
                                    {item.amount && (
                                        <span className="w-24 shrink-0 font-bold tabular-nums">
                                            {item.amount}
                                        </span>
                                    )}
                                    <span className={item.amount ? '' : 'ml-0'}>{item.name}</span>
                                    {item.sources.length > 1 && (
                                        <span className="text-xs uppercase tracking-widest text-faint">
                                            {t('fromCount', { count: item.sources.length })}
                                        </span>
                                    )}
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>

            <div className="print:hidden mt-8 flex flex-wrap gap-4 text-sm">
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="underline underline-offset-4 hover:text-muted"
                >
                    {t('print')}
                </button>
                <button
                    type="button"
                    onClick={clearAll}
                    className="text-muted underline underline-offset-4 hover:text-danger"
                >
                    {t('clearAll')}
                </button>
            </div>
        </>
    );
}
