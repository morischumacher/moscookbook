'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';
import { sayable } from '@/lib/apiMessage';

/**
 * "Ann möchte ihre Einkaufsliste mit dir teilen": joining is the invited
 * person's choice, since from then on they shop on that list instead of
 * their own.
 */
export default function ShoppingInvitations({ invitations }: { invitations: { listId: number; owner: string }[] }) {
    const t = useTranslations('Shopping');
    const router = useRouter();
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');

    const answer = async (listId: number, accept: boolean) => {
        setBusy(listId);
        setError('');
        try {
            const res = await fetch('/api/shopping/invitations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listId, accept }),
            });
            if (!res.ok) {
                const data: { message?: string } = await res.json().catch(() => ({}));
                setError(sayable(data.message, t('failed')));
                return;
            }
            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mb-8 flex flex-col gap-3">
            {invitations.map((invitation) => (
                <div key={invitation.listId} className="rounded-xl border border-ink p-4">
                    <p className="font-medium">{t('invitedBy', { name: invitation.owner })}</p>
                    <p className="mt-1 text-sm text-muted">{t('invitedExplain')}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                        <button type="button" disabled={busy !== null} onClick={() => void answer(invitation.listId, true)} className={buttonPrimarySmall}>
                            <BusyLabel busy={busy === invitation.listId}>{t('join')}</BusyLabel>
                        </button>
                        <button type="button" disabled={busy !== null} onClick={() => void answer(invitation.listId, false)} className="text-sm text-muted underline underline-offset-4">
                            {t('decline')}
                        </button>
                    </div>
                </div>
            ))}
            <p role="status" className={error ? 'text-sm text-danger' : 'sr-only'}>
                {error}
            </p>
        </div>
    );
}
