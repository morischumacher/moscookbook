'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * The public link for one recipe or one entry: make one, show it, take it back.
 *
 * Deliberately not a switch. A switch invites a tap to see what it does, and
 * what this one does is put something on the open internet — so the two
 * directions are two separate, differently worded buttons, and the state is
 * always written out in words above them rather than inferred from a knob's
 * position.
 *
 * Revoking asks first. Everything else here is reversible in one click; this
 * one breaks a link somebody may already have sent to their mother.
 */
export default function ShareLink({
    id,
    kind,
    initialUrl,
    locale,
}: {
    id: number;
    /** Which kind of thing has a public link. Decides the wording and the endpoint. */
    kind: 'recipe' | 'post' | 'collection';
    initialUrl: string | null;
    locale: string;
}) {
    const t = useTranslations('Share');
    const router = useRouter();
    const [ask, dialog] = useConfirm();

    // Spelled out rather than built from `kind`, so that every key this
    // component can ask for is visible to the translation checker.
    const words =
        kind === 'post'
            ? { private: 'statePrivatePost', public: 'statePublicPost', confirm: 'revokeConfirmPost' }
            : kind === 'collection'
              ? {
                  private: 'statePrivateCollection',
                  public: 'statePublicCollection',
                  confirm: 'revokeConfirmCollection',
              }
              : { private: 'statePrivate', public: 'statePublic', confirm: 'revokeConfirm' };

    const endpoint =
        kind === 'post'
            ? `/api/posts/${id}/share`
            : kind === 'collection'
              ? `/api/collections/${id}/share`
              : `/api/recipes/${id}/share`;

    const [url, setUrl] = useState(initialUrl);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const create = async () => {
        setBusy(true);
        setError('');

        try {
            const res = await fetch(`${endpoint}?locale=${encodeURIComponent(locale)}`, {
                method: 'POST',
            });
            const data = await res.json();

            if (!res.ok || typeof data.url !== 'string') {
                setError(data.message || t('linkFailed'));
                return;
            }

            setUrl(data.url);
            // The share sheet and the button below both read this from the
            // server render, so the page has to hear about it too.
            router.refresh();
        } catch {
            setError(t('linkFailed'));
        } finally {
            setBusy(false);
        }
    };

    const revoke = async () => {
        const sure = await ask({
            title: t(words.confirm),
            confirmLabel: t('revoke'),
            destructive: true,
        });
        if (!sure) return;

        setBusy(true);
        setError('');

        try {
            const res = await fetch(endpoint, { method: 'DELETE' });

            if (!res.ok) {
                setError(t('linkFailed'));
                return;
            }

            setUrl(null);
            router.refresh();
        } catch {
            setError(t('linkFailed'));
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!url) return;

        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
        } catch {
            // The field below is readable and selectable, so there is still a
            // way to get the link out; nothing needs to be said.
        }
    };

    return (
        <section className="rounded-lg border border-line p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                {t('visibilityTitle')}
            </h2>

            <p className="mt-2 text-sm leading-relaxed">
                {url ? t(words.public) : t(words.private)}
            </p>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            {url ? (
                <div className="mt-3 flex flex-col gap-3">
                    <input
                        type="text"
                        readOnly
                        value={url}
                        aria-label={t('linkLabel')}
                        onFocus={(event) => event.currentTarget.select()}
                        // 16px, because anything smaller makes iOS Safari zoom
                        // the page when the field takes focus.
                        className="w-full min-w-0 rounded border border-control bg-transparent px-2 py-1 text-base"
                    />

                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            type="button"
                            onClick={copy}
                            className="rounded-full border border-line px-4 py-2 text-sm font-medium"
                        >
                            {copied ? t('copied') : t('copyLink')}
                        </button>

                        <button
                            type="button"
                            onClick={revoke}
                            disabled={busy}
                            className="text-sm text-danger underline underline-offset-4 disabled:opacity-50"
                        >
                            {t('revoke')}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={create}
                    disabled={busy}
                    className={`mt-3 ${buttonPrimarySmall}`}
                >
                    {t('createLink')}
                </button>
            )}

            <span role="status" className="sr-only">
                {copied ? t('copied') : ''}
            </span>

            {dialog}
        </section>
    );
}
