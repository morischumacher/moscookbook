'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { keepOffline } from '@/lib/offlineCopies';
import { BusyLabel } from '@/components/ui/Busy';

/**
 * "Keep my favourites for offline": every favourite opened once in the
 * background, so the kitchen, the holiday flat and the underground all have
 * them. Without this a recipe was only there offline if it had been opened
 * on this phone before.
 */
export default function OfflineFavorites() {
    const t = useTranslations('Home');
    const locale = useLocale();
    const [state, setState] = useState<{ busy: boolean; done: number | null; total: number }>({ busy: false, done: null, total: 0 });

    const keep = async () => {
        setState({ busy: true, done: 0, total: 0 });
        try {
            const res = await fetch('/api/favorites');
            const { slugs }: { slugs: string[] } = await res.json();
            setState({ busy: true, done: 0, total: slugs.length });
            const kept = await keepOffline(
                slugs.map((slug) => `/${locale}/recipe/${slug}`),
                (done) => setState((current) => ({ ...current, done }))
            );
            setState({ busy: false, done: kept, total: slugs.length });
        } catch {
            setState({ busy: false, done: null, total: 0 });
        }
    };

    if (typeof window !== 'undefined' && !('caches' in window)) return null;

    return (
        <p className="text-sm text-muted">
            <button type="button" onClick={() => void keep()} disabled={state.busy} className="underline underline-offset-4 hover:text-ink disabled:opacity-50">
                <BusyLabel busy={state.busy} busyText={t('offlineKeeping', { done: state.done ?? 0, total: state.total })}>
                    {t('offlineKeep')}
                </BusyLabel>
            </button>
            {!state.busy && state.done !== null && <span className="ml-2">{t('offlineKept', { count: state.done })}</span>}
        </p>
    );
}
