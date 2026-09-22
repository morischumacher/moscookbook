'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';

/**
 * Whether this recipe's own address works for somebody with no account.
 *
 * Two states, said plainly, with the consequence attached to each. "Public"
 * and "private" on their own are labels; what somebody needs to know before
 * pressing is that a public recipe can be opened by anybody who has the
 * address and kept by a search engine, and that taking it back removes the
 * page but not the copy somebody else already has.
 *
 * Publishing asks first. Almost nothing else in this application does — the
 * cooking log records a fact in one tap, a note saves when you look away —
 * because almost nothing else leaves the cookbook. This does, and it is the
 * one direction that cannot be fully undone.
 *
 * Taking it back does not ask. Making something less visible is not a
 * decision anybody needs protecting from, and a confirmation there would be
 * ceremony.
 */
export default function Visibility({
    recipeId,
    isPublic,
}: {
    recipeId: number;
    isPublic: boolean;
}) {
    const t = useTranslations('Visibility');
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const set = async (next: boolean) => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(`/api/recipes/${recipeId}/visibility`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isPublic: next }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(data?.message || t('failed'));
                return;
            }

            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-xl border border-line p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
                {isPublic ? t('publicTitle') : t('privateTitle')}
            </p>

            <p className="mt-2 text-sm leading-snug text-muted">
                {isPublic ? t('publicBody') : t('privateBody')}
            </p>

            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}

            <p className="mt-3">
                {isPublic ? (
                    <button
                        type="button"
                        onClick={() => void set(false)}
                        disabled={busy}
                        className="text-sm underline underline-offset-4 disabled:opacity-50"
                    >
                        {busy ? t('working') : t('makePrivate')}
                    </button>
                ) : (
                    <InlineConfirm
                        label={busy ? t('working') : t('makePublic')}
                        question={t('sureQuestion')}
                        confirmLabel={t('makePublic')}
                        disabled={busy}
                        onConfirm={() => set(true)}
                        className="text-sm underline underline-offset-4 disabled:opacity-50"
                    />
                )}
            </p>
        </div>
    );
}
