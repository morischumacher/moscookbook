'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';

/** A named list's new name, from the list's menu. The main list has none; deleting is in the menu itself. */
export default function ListSettings({ listId, name, onDone }: { listId: number; name: string; onDone: () => void }) {
    const t = useTranslations('Shopping');
    const router = useRouter();
    const [draft, setDraft] = useState(name);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const rename = async () => {
        if (!draft.trim()) return;
        setBusy(true);
        const res = await fetch(`/api/shopping/lists?list=${listId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: draft }),
        }).catch(() => null);
        setBusy(false);
        setFailed(!res?.ok);
        if (res?.ok) {
            onDone();
            router.refresh();
        }
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void rename();
            }}
        >
            <label htmlFor="list-name" className="text-sm text-muted">
                {t('listName')}
            </label>
            <div className="mt-1 flex gap-2">
                <input
                    id="list-name"
                    value={draft}
                    maxLength={60}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                />
                <button type="submit" disabled={busy || !draft.trim()} className={buttonPrimarySmall}>
                    <BusyLabel busy={busy}>{t('save')}</BusyLabel>
                </button>
            </div>
            {failed && (
                <p role="alert" className="mt-2 text-danger">
                    {t('failed')}
                </p>
            )}
        </form>
    );
}
