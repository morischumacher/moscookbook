'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';

/** A named list's own settings: its name, and deleting it. The main list has neither. */
export default function ListSettings({ listId, name }: { listId: number; name: string }) {
    const t = useTranslations('Shopping');
    const router = useRouter();
    const [ask, dialog] = useConfirm();
    const [renaming, setRenaming] = useState(false);
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
            setRenaming(false);
            router.refresh();
        }
    };

    const remove = async () => {
        if (!(await ask({ title: t('deleteListQuestion', { name }), confirmLabel: t('deleteList'), destructive: true }))) return;
        const res = await fetch(`/api/shopping/lists?list=${listId}`, { method: 'DELETE' }).catch(() => null);
        if (res?.ok) {
            router.replace('/shopping');
            router.refresh();
        } else setFailed(true);
    };

    return (
        <div className="flex flex-col gap-3">
            {dialog}
            {renaming ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void rename();
                    }}
                    className="flex gap-2"
                >
                    <label htmlFor="list-name" className="sr-only">
                        {t('listName')}
                    </label>
                    <input
                        id="list-name"
                        // Opened by a tap on "rename": the field is what was asked for.
                        autoFocus
                        value={draft}
                        maxLength={60}
                        onChange={(event) => setDraft(event.target.value)}
                        className="min-w-0 flex-1 rounded-full border border-control bg-transparent px-4 py-2 outline-none focus:border-ink"
                    />
                    <button type="submit" disabled={busy || !draft.trim()} className={buttonPrimarySmall}>
                        <BusyLabel busy={busy}>{t('save')}</BusyLabel>
                    </button>
                </form>
            ) : (
                <div className="flex flex-wrap gap-4">
                    <button type="button" onClick={() => setRenaming(true)} className="underline underline-offset-4">
                        {t('renameList')}
                    </button>
                    <button type="button" onClick={() => void remove()} className="text-faint underline underline-offset-4 hover:text-danger">
                        {t('deleteList')}
                    </button>
                </div>
            )}
            {failed && <p className="text-danger">{t('failed')}</p>}
        </div>
    );
}
