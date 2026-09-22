'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import InlineConfirm from '@/components/ui/InlineConfirm';
import ShareLink from '@/components/recipe/ShareLink';

/**
 * Who can see this recipe — the whole question, in one box.
 *
 * It was two boxes for about an hour: "Privat / Veröffentlichen" stacked on
 * "Sichtbarkeit / Öffentlichen Link erstellen", each with its own heading,
 * each describing the same recipe in slightly different words, sitting
 * directly on top of each other. Two panels for one question is the same
 * mistake as two sections for one act of cooking, made by the same person on
 * the same day.
 *
 * So: one heading, one sentence saying where this recipe stands, and then the
 * controls that apply to that state and no others.
 *
 * **Published** shows the recipe's own address, which is the thing to hand
 * somebody, and one way back. No secret link, because a secret link is what
 * you make when the real address ends at a sign-in form — offering one here
 * would be a worse version of what is already on screen.
 *
 * **Private** offers both directions, and they are genuinely different acts:
 * publishing puts the recipe on the open web for anyone and for search
 * engines; a secret link hands it to one person and can be taken back. The
 * first asks before it happens, because it is the one that cannot be fully
 * undone — taking a page down does not take back the copy somebody else made.
 *
 * Admin only, both here and in the two endpoints behind it. Everybody with an
 * account is trusted; "trusted" and "may publish" are different permissions,
 * and only one of them is irreversible.
 */
export default function Visibility({
    recipeId,
    isPublic,
    url,
    shareUrl,
    locale,
}: {
    recipeId: number;
    isPublic: boolean;
    /** The recipe's own address — what a published recipe is shared as. */
    url: string;
    /** The secret link, when one exists. */
    shareUrl: string | null;
    locale: string;
}) {
    const t = useTranslations('Visibility');
    const router = useRouter();

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

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

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
        } catch {
            // The field is readable and selectable, so the address can still be
            // got out; nothing needs to be said.
        }
    };

    return (
        <section className="rounded-lg border border-line p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                {t('heading')}
            </h2>

            <p className="mt-2 text-sm leading-relaxed">
                {isPublic ? t('publicBody') : t('privateBody')}
            </p>

            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}

            {isPublic ? (
                <div className="mt-3 flex flex-col gap-3">
                    <input
                        type="text"
                        readOnly
                        value={url}
                        aria-label={t('addressLabel')}
                        onFocus={(event) => event.currentTarget.select()}
                        // 16px, or iOS Safari zooms the page when it takes focus.
                        className="w-full min-w-0 rounded border border-control bg-transparent px-2 py-1 text-base"
                    />

                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            type="button"
                            onClick={copy}
                            className="rounded-full border border-line px-4 py-2 text-sm font-medium"
                        >
                            {copied ? t('copied') : t('copyAddress')}
                        </button>

                        <button
                            type="button"
                            onClick={() => void set(false)}
                            disabled={busy}
                            className="text-sm underline underline-offset-4 disabled:opacity-50"
                        >
                            {busy ? t('working') : t('makePrivate')}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* The secret link, in the same box rather than a second
                        one. Its own heading and state line are suppressed
                        because this panel has already said both. */}
                    <ShareLink
                        id={recipeId}
                        kind="recipe"
                        initialUrl={shareUrl}
                        locale={locale}
                        bare
                    />

                    <p className="mt-4 border-t border-line pt-4">
                        <InlineConfirm
                            label={busy ? t('working') : t('makePublic')}
                            question={t('sureQuestion')}
                            confirmLabel={t('makePublic')}
                            disabled={busy}
                            onConfirm={() => set(true)}
                            className="text-sm underline underline-offset-4 disabled:opacity-50"
                        />
                    </p>
                </>
            )}

            <span role="status" className="sr-only">
                {copied ? t('copied') : ''}
            </span>
        </section>
    );
}
