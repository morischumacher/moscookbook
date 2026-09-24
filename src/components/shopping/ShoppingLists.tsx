'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';
import type { ListSummary } from '@/lib/shoppingDb';
import { listLabel } from './listLabel';

/**
 * The person's lists as a row of chips — the main list first, then their own
 * named ones, then the ones they joined — and "+ Neue Liste" at the end.
 */
export default function ShoppingLists({ lists, current }: { lists: ListSummary[]; current: number }) {
    const t = useTranslations('Shopping');
    const router = useRouter();
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const create = async () => {
        if (!name.trim()) return;
        setBusy(true);
        const res = await fetch('/api/shopping/lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        }).catch(() => null);
        setBusy(false);
        if (!res?.ok) {
            setFailed(true);
            return;
        }
        const { id } = (await res.json()) as { id: number };
        setCreating(false);
        setName('');
        router.push(`/shopping?list=${id}`);
    };

    const chip = (active: boolean) =>
        `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${
            active ? 'border-ink bg-ink text-page' : 'border-control text-muted hover:border-ink hover:text-ink'
        }`;

    return (
        <div className="mb-6">
            <nav aria-label={t('listsLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {lists.map((list) => (
                    <Link
                        key={list.id}
                        href={list.owner && list.name === null ? '/shopping' : `/shopping?list=${list.id}`}
                        aria-current={list.id === current ? 'page' : undefined}
                        className={chip(list.id === current)}
                    >
                        {listLabel(list, t)}
                        {list.count > 0 && <span className="text-xs opacity-70">{list.count}</span>}
                    </Link>
                ))}
                {!creating && (
                    <button type="button" onClick={() => setCreating(true)} className={chip(false)}>
                        {t('newList')}
                    </button>
                )}
            </nav>
            {creating && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void create();
                    }}
                    className="mt-3 flex gap-2"
                >
                    <label htmlFor="new-list" className="sr-only">
                        {t('listName')}
                    </label>
                    <input
                        id="new-list"
                        // Opened by a tap on "new list": the field is what was asked for.
                        autoFocus
                        value={name}
                        maxLength={60}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('listNamePlaceholder')}
                        className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                    />
                    <button type="submit" disabled={busy || !name.trim()} className={buttonPrimarySmall}>
                        <BusyLabel busy={busy}>{t('createList')}</BusyLabel>
                    </button>
                </form>
            )}
            {failed && <p role="alert" className="mt-2 text-sm text-danger">{t('failed')}</p>}
        </div>
    );
}
