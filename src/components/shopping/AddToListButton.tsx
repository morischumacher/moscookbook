'use client';

import { useTranslations } from 'next-intl';
import { useShoppingSelection } from './useShoppingSelection';

export default function AddToListButton({ recipeId }: { recipeId: number }) {
    const t = useTranslations('ShoppingList');
    const { has, toggle } = useShoppingSelection();

    const onList = has(recipeId);

    return (
        <button
            type="button"
            onClick={() => toggle(recipeId)}
            aria-pressed={onList}
            className={`flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors ${onList
                ? 'bg-ink text-page'
                : 'border border-control text-muted hover:border-ink hover:text-ink'
                }`}
        >
            {onList ? t('onList') : t('addToList')}
        </button>
    );
}
