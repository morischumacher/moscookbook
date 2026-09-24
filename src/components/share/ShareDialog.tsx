'use client';

import { useRef, useState } from 'react';
import { useDialogFocus } from '@/components/ui/useDialogFocus';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { messageFrom } from '@/lib/apiMessage';
import { useCopy } from '@/components/ui/useCopy';
import { sharePayload } from '@/lib/sharePayload';
import { buttonPrimarySmall } from '@/lib/ui';
import {
    planFor,
    stageOf,
    isNoop,
    type ShareKind,
    type ShareStage,
} from '@/lib/shareStage';

/**
 * Who can see this, in one place.
 *
 * The cookbook has had three stages since the day a recipe could be published
 * — household, secret link, open web — and expressed them through two controls
 * that knew nothing about each other. Worse, the Share button *minted a
 * permanent public link as a side effect* of being pressed on a private
 * recipe, which is the kind of thing you find out about weeks later.
 *
 * So Share opens this, always, and the first thing on it is the answer to the
 * question somebody is actually asking. Choosing a stage performs whatever
 * that takes — see `planFor`, which is where those rules live and are tested —
 * and only then is there a link to hand over.
 *
 * ## The cost, and why it is worth paying
 *
 * Sharing something already shareable used to be one tap. It is two now. The
 * alternative was a button that sometimes opened a dialog and sometimes fired
 * the system share sheet depending on invisible state, which is the same
 * unpredictability this whole dialog exists to end.
 *
 * `navigator.share` still works: it has to be called while the browser is
 * handling a gesture, and pressing the button *inside* this dialog is one.
 */
export default function ShareDialog({
    id,
    kind,
    title,
    locale,
    isPublic,
    linkUrl,
    onlyMe = false,
    ownUrl,
    onClose,
}: {
    id: number;
    kind: ShareKind;
    title: string;
    locale: string;
    isPublic: boolean;
    /** The secret address, when one has been minted. */
    linkUrl: string | null;
    /** Only the admins read it — the fourth stage, recipes only. */
    onlyMe?: boolean;
    /** The thing's own address, which works for anybody once it is public. */
    ownUrl: string;
    onClose: () => void;
}) {
    const t = useTranslations('Share');
    const router = useRouter();
    const { copy, copied, failed: copyRefused } = useCopy();

    const [state, setState] = useState({ isPublic, linkUrl, onlyMe });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const card = useRef<HTMLDivElement>(null);
    const firstRow = useRef<HTMLButtonElement>(null);

    const stage = stageOf(state);

    // The address that matches where it stands: its own once it is on the web,
    // the secret one while it is only a link, and nothing at all when it is
    // the household's — there is nothing to hand over then.
    const shareable = stage === 'web' ? ownUrl : stage === 'link' ? state.linkUrl : null;

    // In, trapped, Escape out, and back to the Share button afterwards.
    useDialogFocus(card, onClose, firstRow);

    /** The endpoints, per kind. Spelled out so each is greppable. */
    const endpoints = {
        recipe: { visibility: `/api/recipes/${id}/visibility`, link: `/api/recipes/${id}/share` },
        post: { visibility: `/api/posts/${id}/visibility`, link: `/api/posts/${id}/share` },
        collection: {
            visibility: `/api/collections/${id}/visibility`,
            link: `/api/collections/${id}/share`,
        },
    }[kind];

    const choose = async (wanted: ShareStage) => {
        const plan = planFor(state, wanted);
        if (isNoop(plan)) return;

        setBusy(true);
        setError('');

        try {
            let next = { ...state };

            // First, and on its own: into "admins" the server also
            // unpublishes and withdraws the link; out of it, what follows
            // starts from the household.
            if (plan.setOnlyMe !== null) {
                const res = await fetch(endpoints.visibility, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ onlyMe: plan.setOnlyMe }),
                });
                if (!res.ok) {
                    setError(await messageFrom(res, t('failed')));
                    return;
                }
                next = plan.setOnlyMe ? { isPublic: false, linkUrl: null, onlyMe: true } : { ...next, onlyMe: false };
            }

            if (plan.setPublic !== null) {
                const res = await fetch(endpoints.visibility, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isPublic: plan.setPublic }),
                });
                if (!res.ok) {
                    setError(await messageFrom(res, t('failed')));
                    return;
                }
                next = { ...next, isPublic: plan.setPublic };
            }

            if (plan.mintLink) {
                const res = await fetch(`${endpoints.link}?locale=${encodeURIComponent(locale)}`, {
                    method: 'POST',
                });
                const data = await res.json().catch(() => null);
                if (!res.ok || typeof data?.url !== 'string') {
                    setError(await messageFrom(res, t('failed')));
                    return;
                }
                next = { ...next, linkUrl: data.url };
            }

            if (plan.revokeLink) {
                const res = await fetch(endpoints.link, { method: 'DELETE' });
                if (!res.ok) {
                    setError(await messageFrom(res, t('failed')));
                    return;
                }
                next = { ...next, linkUrl: null };
            }

            setState(next);
            // The page around this renders from the server and still believes
            // the old answer.
            router.refresh();
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    const handOver = async () => {
        if (!shareable) return;

        if (typeof navigator.share === 'function') {
            try {
                await navigator.share(sharePayload(title, shareable));
                return;
            } catch (error) {
                // Cancelling the sheet rejects with AbortError. That is
                // somebody changing their mind, not a failure, and falling
                // through to the clipboard there would be rude.
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }

        await copy(shareable, 'link');
    };

    const rows: { stage: ShareStage; label: string; body: string }[] = [
        // Recipes only: a post or a collection is written for others.
        ...(kind === 'recipe' ? [{ stage: 'admins' as const, label: t('stageAdmins'), body: t('stageAdminsBody') }] : []),
        { stage: 'household', label: t('stageHousehold'), body: t('stageHouseholdBody') },
        { stage: 'link', label: t('stageLink'), body: t('stageLinkBody') },
        { stage: 'web', label: t('stageWeb'), body: t(kind === 'recipe' ? 'stageWebBody' : 'stageWebBodyOther') },
    ];

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-scrim/40 p-4 sm:items-center"
            // A press on the ground behind the card closes it, the way every
            // sheet on a phone does.
            onPointerDown={(event) => {
                if (!card.current?.contains(event.target as Node)) onClose();
            }}
        >
            <div
                ref={card}
                role="dialog"
                aria-modal="true"
                aria-label={t('share')}
                className="w-full max-w-md rounded-xl border border-line bg-page p-5 shadow-lg"
            >
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                    {t('whoCanSee')}
                </h2>

                <div className="mt-4 flex flex-col gap-2">
                    {rows.map((row, index) => {
                        const here = stage === row.stage;

                        return (
                            <button
                                key={row.stage}
                                ref={index === 0 ? firstRow : undefined}
                                type="button"
                                disabled={busy}
                                onClick={() => void choose(row.stage)}
                                aria-pressed={here}
                                className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                                    here ? 'border-ink' : 'border-line hover:border-control'
                                }`}
                            >
                                <span className={`block text-sm ${here ? 'font-semibold text-ink' : ''}`}>
                                    {row.label}
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                                    {row.body}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {error && (
                    <p role="alert" className="mt-4 rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                        {error}
                    </p>
                )}

                {shareable && (
                    <div className="mt-5 flex flex-col gap-3">
                        <input
                            type="text"
                            readOnly
                            value={shareable}
                            aria-label={t('linkLabel')}
                            onFocus={(event) => event.currentTarget.select()}
                            // 16px, or iOS Safari zooms the page on focus.
                            className="w-full min-w-0 rounded border border-control bg-transparent px-2 py-1 text-base"
                        />

                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" onClick={() => void handOver()} className={buttonPrimarySmall}>
                                {t('share')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void copy(shareable, 'link')}
                                className="text-sm underline underline-offset-4"
                            >
                                {copied === 'link' ? t('copied') : t('copyLink')}
                            </button>
                        </div>

                        {copyRefused && <p role="alert" className="text-sm text-danger">{t('copyFailed')}</p>}
                    </div>
                )}

                <div className="mt-5 flex justify-end border-t border-line pt-4">
                    <button type="button" onClick={onClose} className="text-sm underline underline-offset-4">
                        {t('done')}
                    </button>
                </div>
            </div>
        </div>
    );
}
