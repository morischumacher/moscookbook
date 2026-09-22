'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';

/**
 * Publish, unpublish and share, from the list.
 *
 * These lived only on the recipe's own page, which meant that changing the
 * visibility of four recipes was four page loads, four scrolls past the
 * ingredients and four journeys back. The list is where somebody thinks about
 * recipes in the plural, so it is where the actions that apply to them in the
 * plural belong.
 *
 * Three words rather than a panel. The row already carries a title, a
 * category, a count and two other actions; a bordered box per row would turn
 * a list into a stack of forms. What each word does is the same as on the
 * recipe page, and the recipe page is still where the consequences are
 * explained in sentences — this is the shortcut, not the explanation.
 *
 * **Share** does the one obvious thing for whichever state the recipe is in: a
 * published recipe copies its own address, a private one copies its secret
 * link, and a private one that has no link yet makes one and copies that. The
 * distinction matters to the person deciding; it does not matter to the person
 * who just wants to send it to their mother.
 */
export default function RecipeRowActions({
    recipeId,
    isPublic,
    url,
    shareUrl,
}: {
    recipeId: number;
    isPublic: boolean;
    /** The recipe's own address. */
    url: string;
    /** The secret link, when one already exists. */
    shareUrl: string | null;
}) {
    const t = useTranslations('Visibility');
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const toClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard access can be refused. Saying so is more use than a
            // silent no-op, because there is no visible field to copy from
            // here the way there is on the recipe page.
            setError(t('copyFailed'));
        }
    };

    const share = async () => {
        setError('');

        if (isPublic) {
            await toClipboard(url);
            return;
        }

        if (shareUrl) {
            await toClipboard(shareUrl);
            return;
        }

        setBusy(true);

        try {
            const res = await fetch(`/api/recipes/${recipeId}/share`, { method: 'POST' });
            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.url) {
                setError(data?.message || t('failed'));
                return;
            }

            await toClipboard(data.url);
            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    const setPublic = async (next: boolean) => {
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

    const link = 'underline underline-offset-4 hover:text-muted disabled:opacity-50';

    return (
        <span className="flex flex-wrap items-center gap-3">
            {error && <span className="text-danger">{error}</span>}

            <button type="button" onClick={() => void share()} disabled={busy} className={link}>
                {copied ? t('copied') : t('share')}
            </button>

            {isPublic ? (
                <button
                    type="button"
                    onClick={() => void setPublic(false)}
                    disabled={busy}
                    className={link}
                >
                    {t('makePrivate')}
                </button>
            ) : (
                // Asks first, here as on the recipe page. The list is exactly
                // where a mis-tap is most likely — the rows are close together
                // and the labels are short — and this is the one action that
                // cannot be fully undone.
                <InlineConfirm
                    label={t('makePublic')}
                    question={t('sureQuestion')}
                    confirmLabel={t('makePublic')}
                    disabled={busy}
                    onConfirm={() => setPublic(true)}
                    className={link}
                />
            )}
        </span>
    );
}
