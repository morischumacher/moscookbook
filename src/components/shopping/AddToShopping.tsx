'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
    const locale = useLocale();
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'empty' | 'undoing' | 'removed' | 'failed'>('idle');

    const what =
        'recipeId' in props
            ? { recipeId: props.recipeId, servings: props.servings }
            : 'menuId' in props
              ? { menuId: props.menuId }
              : { collectionId: props.collectionId };

    // What was actually sent. Undo takes back exactly that — not what the
    // servings stepper says by the time somebody presses it.
    const sentBody = useRef<string | null>(null);

    const add = async () => {
        setState('busy');
        const body = JSON.stringify({ ...what, locale });
        try {
            const res = await fetch('/api/shopping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            if (!res.ok) {
                setState('failed');
                return;
            }
            // "It is on the list" was said about a recipe with no
            // ingredients, whose list then stayed empty.
            const data: { added?: number } = await res.json().catch(() => ({}));
            sentBody.current = body;
            setState(data.added === 0 ? 'empty' : 'done');
        } catch {
            setState('failed');
        }
    };

    /** Takes back exactly what was just added. */
    const undo = async () => {
        if (!sentBody.current) return;
        setState('undoing');
        try {
            const res = await fetch('/api/shopping/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: sentBody.current,
            });
            setState(res.ok ? 'removed' : 'failed');
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
                className={`${buttonSecondary} w-full whitespace-nowrap sm:w-auto`}
            >
                <BusyLabel busy={state === 'busy'}>{label}</BusyLabel>
            </button>
            <span role="status" className="text-muted">
                {(state === 'done' || state === 'undoing') && (
                    <>
                        {t('addedRecipe')}{' '}
                        <Link href="/shopping" className="font-medium text-ink underline underline-offset-4">
                            {t('openList')}
                        </Link>
                        {' · '}
                        <button type="button" onClick={() => void undo()} disabled={state === 'undoing'} className="underline underline-offset-4 hover:text-danger">
                            <BusyLabel busy={state === 'undoing'}>{t('undoAdd')}</BusyLabel>
                        </button>
                    </>
                )}
                {state === 'empty' && t('nothingToAdd')}
                {state === 'removed' && t('removedAgain')}
                {state === 'failed' && <span className="text-danger">{t('failed')}</span>}
            </span>
        </span>
    );
}
