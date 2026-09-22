'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * The one press that turns an import into one of this cookbook's own recipes.
 *
 * No confirmation dialogue. The act is additive — a recipe joins the list —
 * and the only thing it makes irreversible is a state nobody wants to go back
 * to. A dialogue here would be a question with one sensible answer, asked
 * every time.
 *
 * It does not say "veröffentlichen" and the reason is worth keeping: this
 * cookbook already has a thing called public, and it means visible on the
 * internet without an account. Two buttons using that word for two different
 * acts is how somebody ends up sharing a recipe they meant to file.
 */
export default function FinishDraft({ recipeId }: { recipeId: number }) {
    const t = useTranslations('Drafts');
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    async function finish() {
        setBusy(true);
        setFailed(false);

        try {
            const response = await fetch(`/api/recipes/${recipeId}/draft`, { method: 'POST' });
            if (!response.ok) {
                setFailed(true);
                return;
            }
            // The recipe has moved between two lists, and the filter chips are
            // cached, so the whole route is refreshed rather than this card.
            router.refresh();
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    }

    return (
        <span className="inline-flex items-center gap-3">
            <button type="button" className={buttonPrimarySmall} disabled={busy} onClick={finish}>
                {busy ? t('finishing') : t('finish')}
            </button>
            {failed && <span className="text-sm text-danger">{t('finishFailed')}</span>}
        </span>
    );
}
