'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

/** The admin's "it still says the same": a stale-translation note cleared in one tap. */
export default function TranslationFresh({ recipeId, locale }: { recipeId: number; locale: 'de' | 'en' }) {
    const t = useTranslations('Recipe');
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    return (
        <button
            type="button"
            disabled={busy}
            onClick={async () => {
                setBusy(true);
                const res = await fetch(`/api/recipes/${recipeId}/translation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locale }),
                }).catch(() => null);
                setBusy(false);
                if (res?.ok) router.refresh();
            }}
            className="ml-2 underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
            {t('translationStillCurrent')}
        </button>
    );
}
