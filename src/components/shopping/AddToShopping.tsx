'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonSecondary } from '@/lib/ui';

/**
 * "Put this on the shopping list" — a recipe at the servings it is being read
 * at, or every recipe in a collection. Stays on the page and says it worked,
 * with the way to the list beside it, because the next thing is usually a
 * second recipe rather than the list.
 */
export default function AddToShopping(
    props: { recipeId: number; servings: number | null } | { collectionId: number } | { menuId: number; guests: number | null }
) {
    const t = useTranslations('Shopping');
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

    const add = async () => {
        setState('busy');
        try {
            const res = await fetch('/api/shopping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    'recipeId' in props
                        ? { recipeId: props.recipeId, servings: props.servings }
                        : 'menuId' in props
                          ? { menuId: props.menuId }
                          : { collectionId: props.collectionId }
                ),
            });
            setState(res.ok ? 'done' : 'failed');
        } catch {
            setState('failed');
        }
    };

    const label =
        'recipeId' in props
            ? t('addRecipe')
            : 'menuId' in props
              ? props.guests
                  ? t('addMenuGuests', { count: props.guests })
                  : t('addCollection')
              : t('addCollection');

    return (
        <span className="inline-flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:flex-none">
            <button
                type="button"
                onClick={() => void add()}
                disabled={state === 'busy'}
                className={`${buttonSecondary} w-full sm:w-auto`}
            >
                <BusyLabel busy={state === 'busy'}>
                    <span aria-hidden="true">🛒 </span>
                    {label}
                </BusyLabel>
            </button>
            <span role="status" className="text-muted">
                {state === 'done' && (
                    <>
                        {t('addedRecipe')}{' '}
                        <Link href="/shopping" className="font-medium text-ink underline underline-offset-4">
                            {t('openList')}
                        </Link>
                    </>
                )}
                {state === 'failed' && <span className="text-danger">{t('failed')}</span>}
            </span>
        </span>
    );
}
