'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonSecondary } from '@/lib/ui';
import type { ListSummary } from '@/lib/shoppingDb';
import { listLabel } from './listLabel';

/**
 * "Put this on the shopping list" — a recipe at the servings it is being read
 * at, or every recipe in a collection. Stays on the page and says it worked,
 * with the way to the list beside it, because the next thing is usually a
 * second recipe rather than the list.
 *
 * With more than one list there is a choice of which, remembered for next
 * time; with one there is nothing to choose.
 */

const TARGET_KEY = 'shopping-target';
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
    // Which list it went on, for undo and for the way to the list.
    const [sentTo, setSentTo] = useState('');

    const [lists, setLists] = useState<ListSummary[]>([]);
    const [target, setTarget] = useState('');
    useEffect(() => {
        let alive = true;
        fetch('/api/shopping/lists')
            .then((res) => (res.ok ? (res.json() as Promise<{ lists: ListSummary[] }>) : null))
            .then((data) => {
                if (!alive || !data) return;
                setLists(data.lists);
                let remembered = '';
                try {
                    remembered = localStorage.getItem(TARGET_KEY) ?? '';
                } catch {
                    // Blocked storage: the main list.
                }
                if (data.lists.some((list) => String(list.id) === remembered)) setTarget(remembered);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, []);
    const choose = (value: string) => {
        setTarget(value);
        try {
            localStorage.setItem(TARGET_KEY, value);
        } catch {
            // Only a convenience.
        }
    };
    const query = target ? `?list=${target}` : '';

    const add = async () => {
        setState('busy');
        const body = JSON.stringify({ ...what, locale });
        try {
            const res = await fetch(`/api/shopping${query}`, {
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
            setSentTo(query);
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
            const res = await fetch(`/api/shopping/remove${sentTo}`, {
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
            {lists.length > 1 && (
                <select
                    value={target}
                    onChange={(event) => choose(event.target.value)}
                    aria-label={t('addTo')}
                    className="w-full rounded-full border border-control bg-transparent px-3 py-2 text-sm sm:w-auto"
                >
                    {lists.map((list) => (
                        <option key={list.id} value={list.owner && list.name === null ? '' : String(list.id)}>
                            {listLabel(list, t)}
                        </option>
                    ))}
                </select>
            )}
            <span role="status" className="text-muted">
                {(state === 'done' || state === 'undoing') && (
                    <>
                        {t('addedRecipe')}{' '}
                        <Link href={`/shopping${sentTo}`} className="font-medium text-ink underline underline-offset-4">
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
