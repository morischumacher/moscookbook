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
 * With more than one list, the button opens a short menu of them — which
 * one, chosen as part of adding rather than by a box beside the button (the
 * owner's wish); with one there is nothing to choose.
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
    const [picking, setPicking] = useState(false);
    const menu = useRef<HTMLSpanElement>(null);
    // The menu closes on a tap outside it, or Escape.
    useEffect(() => {
        if (!picking) return;
        const away = (event: PointerEvent) => {
            if (!menu.current?.contains(event.target as Node)) setPicking(false);
        };
        const key = (event: KeyboardEvent) => event.key === 'Escape' && setPicking(false);
        document.addEventListener('pointerdown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('pointerdown', away);
            document.removeEventListener('keydown', key);
        };
    }, [picking]);

    const add = async (value: string = target) => {
        setPicking(false);
        const query = value ? `?list=${value}` : '';
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
            <span ref={menu} className="relative w-full sm:w-auto">
                <button
                    type="button"
                    onClick={() => (lists.length > 1 ? setPicking((open) => !open) : void add())}
                    disabled={state === 'busy'}
                    aria-haspopup={lists.length > 1 ? 'menu' : undefined}
                    aria-expanded={lists.length > 1 ? picking : undefined}
                    className={`${buttonSecondary} w-full whitespace-nowrap sm:w-auto`}
                >
                    <BusyLabel busy={state === 'busy'}>{label}</BusyLabel>
                </button>
                {picking && (
                    <ul role="menu" aria-label={t('addTo')} className="absolute left-0 top-full z-30 mt-1 min-w-full overflow-hidden rounded-xl border border-line bg-page py-1 shadow-lg">
                        {lists.map((list) => {
                            const value = list.owner && list.name === null ? '' : String(list.id);
                            return (
                                <li key={list.id} role="none">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            choose(value);
                                            void add(value);
                                        }}
                                        className={`flex min-h-11 w-full items-center gap-2 whitespace-nowrap px-4 text-left text-sm hover:bg-surface ${value === target ? 'font-semibold' : ''}`}
                                    >
                                        {listLabel(list, t)}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </span>
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
