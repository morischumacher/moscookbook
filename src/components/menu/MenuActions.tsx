'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import { sayable } from '@/lib/apiMessage';

/**
 * Edit and delete for one menu, for an admin — under it in the list, and on
 * its own page. Deleted from its own page, the menu's address is gone, so
 * the list opens instead of a "not found" (work #39); a delete that fails
 * says so rather than nothing.
 */
export default function MenuActions({ menuId, onItsPage = false }: { menuId: number; onItsPage?: boolean }) {
    const t = useTranslations('Menus');
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const remove = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch(`/api/menus/${menuId}`, { method: 'DELETE' });
            if (!res.ok) {
                setError(sayable((await res.json().catch(() => ({}))).message, t('deleteFailed')));
                return;
            }
            if (onItsPage) router.replace('/menus');
            router.refresh();
        } catch {
            setError(t('deleteFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2">
            <div className="flex flex-wrap items-center gap-x-5 text-sm">
                <Link href={`/admin/menus/${menuId}`} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 hover:text-muted">
                    {t('edit')}
                </Link>
                <InlineConfirm
                    label={t('delete')}
                    question={t('confirmDelete')}
                    confirmLabel={t('delete')}
                    destructive
                    disabled={busy}
                    onConfirm={remove}
                    className="inline-flex min-h-11 items-center text-muted underline underline-offset-4 hover:text-danger"
                />
            </div>
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}
