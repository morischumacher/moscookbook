'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ErrorsPanel from './ErrorsPanel';
import TicketsPanel from './TicketsPanel';
import WorkPanel from './WorkPanel';
import PageHeader from './PageHeader';
import { pageContainer } from '@/lib/ui';

type Side = 'errors' | 'tickets' | 'work';

/**
 * The two sides of "something was reported", side by side.
 *
 * The segment is state rather than a route: switching sides is not going
 * somewhere, and a route would put a page load between two lists that are
 * already only a scroll apart.
 *
 * It opens on whichever side has something open on it, tickets first when
 * both do — a person who took the trouble to write a sentence outranks a
 * stack trace. When everything is quiet it opens on the errors, which is the
 * side an admin comes here to check.
 */
export default function Reports({
    openErrors,
    openTickets,
}: {
    openErrors: number;
    openTickets: number;
}) {
    const t = useTranslations('Reports');
    const tWork = useTranslations('Work');
    const [side, setSide] = useState<Side>(openTickets > 0 ? 'tickets' : 'errors');

    const tab = (value: Side, label: string, count: number) => {
        const here = side === value;

        return (
            <button
                type="button"
                onClick={() => setSide(value)}
                aria-pressed={here}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors ${
                    here
                        ? 'border-ink font-semibold text-ink'
                        : 'border-transparent text-muted hover:text-ink'
                }`}
            >
                {label}
                {count > 0 && (
                    <span
                        className="inline-block min-w-[1.25rem] rounded-full bg-danger-surface px-1.5 text-center text-xs font-semibold text-danger"
                        aria-label={`, ${count}`}
                    >
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>
        );
    };

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('title')} />

            <div className="mb-8 -mt-2 flex gap-6 border-b border-line">
                {tab('errors', t('errors'), openErrors)}
                {tab('tickets', t('tickets'), openTickets)}
                {tab('work', tWork('tab'), 0)}
            </div>

            {/*
                Both are mounted, and the hidden one is hidden rather than
                unmounted: each fetches its own list, and unmounting would
                make every switch back a second request and a second wait for
                a list that has not changed.
            */}
            <div hidden={side !== 'errors'}>
                <ErrorsPanel />
            </div>
            <div hidden={side !== 'tickets'}>
                <TicketsPanel />
            </div>
            {/* Only mounted when opened: it is the list least often looked at. */}
            {side === 'work' && <WorkPanel />}
        </main>
    );
}
