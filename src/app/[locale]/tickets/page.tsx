'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { buttonPrimary, chip, pageContainer, pageHeading, pageTop } from '@/lib/ui';

/** idea | problem | other. Three, because a chooser with eight is a form. */
const KINDS = ['idea', 'problem', 'other'] as const;

/**
 * A place to say what is wrong with the tool.
 *
 * One chooser, one box, one button. The thing being collected is a sentence
 * somebody would otherwise say in a kitchen and forget by morning, and every
 * field added to this page is a reason not to bother: a title, a priority, a
 * "steps to reproduce" — each of them turns a remark into a ticket, and a
 * ticket is work.
 *
 * The page they came from travels with it, read from the referrer rather than
 * asked for. "It's broken on the recipe screen, I think" is a conversation;
 * `/de/recipe/gruenes-curry` is a reproduction, and nobody should have to type
 * it.
 *
 * After sending, the form is replaced rather than cleared. A cleared form
 * invites a second one and says nothing about the first; what somebody wants
 * to know here is that it arrived.
 */
export default function TicketsPage() {
    const t = useTranslations('Tickets');

    const [kind, setKind] = useState<(typeof KINDS)[number]>('idea');
    const [body, setBody] = useState('');
    const [path, setPath] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    // Same-origin only, and the path alone. A referrer from somewhere else is
    // not where they were in this application, and the query string can carry
    // a token — a reset link is the obvious one.
    useEffect(() => {
        try {
            const referrer = document.referrer;
            if (!referrer) return;

            const url = new URL(referrer);
            if (url.origin !== window.location.origin) return;
            if (url.pathname.includes('/tickets')) return;

            setPath(url.pathname);
        } catch {
            /* a referrer that will not parse is simply no referrer */
        }
    }, []);

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, body, path }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setError(data?.message || t('failed'));
                return;
            }

            setSent(true);
        } catch {
            setError(t('failed'));
        } finally {
            setBusy(false);
        }
    };

    if (sent) {
        return (
            <main className={`${pageContainer} ${pageTop} pb-32`}>
                <h1 className={pageHeading}>{t('thanksTitle')}</h1>
                <p className="mt-8 font-serif text-lg leading-relaxed text-muted">{t('thanksBody')}</p>
                <Link href="/" className="mt-8 inline-block text-sm underline underline-offset-4">
                    {t('backToRecipes')}
                </Link>
            </main>
        );
    }

    return (
        <main className={`${pageContainer} ${pageTop} pb-32`}>
            <h1 className={pageHeading}>{t('title')}</h1>
            <p className="mt-6 font-serif text-lg leading-relaxed text-muted">{t('intro')}</p>

            <form onSubmit={send} className="mt-8 flex flex-col gap-6">
                {error && (
                    <p role="alert" className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                        {error}
                    </p>
                )}

                <fieldset>
                    <legend className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">
                        {t('kindLabel')}
                    </legend>

                    {/* Radio buttons rather than a select: three options that
                        are all visible is a glance, and a select is a tap, a
                        list and a second tap for the same decision. */}
                    <div className="flex flex-wrap gap-2">
                        {KINDS.map((option) => (
                            <label
                                key={option}
                                className={chip(kind === option)}
                            >
                                <input
                                    type="radio"
                                    name="kind"
                                    value={option}
                                    checked={kind === option}
                                    onChange={() => setKind(option)}
                                    className="sr-only"
                                />
                                {t(`kind_${option}`)}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div>
                    <label htmlFor="body" className="mb-2 block text-sm font-bold uppercase tracking-widest text-muted">
                        {t('bodyLabel')}
                    </label>
                    <textarea
                        id="body"
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        required
                        maxLength={2000}
                        rows={7}
                        placeholder={t('bodyPlaceholder')}
                        // 16px, or iOS Safari zooms the page in on focus.
                        className="w-full rounded-lg border border-control bg-transparent p-3 text-base leading-relaxed outline-none transition-colors focus:border-ink"
                    />
                </div>

                {/*
                    Explained, and removable.
                    
                    This was one word and a path — "Kommt von:
                    /de/recipe/green-curry" — which is the system describing
                    itself to somebody who did not ask. The first person to see
                    it asked what it meant, which is the only review this kind
                    of line ever gets.
                    
                    It says what it is for now, and it can be taken off. The
                    page is genuinely useful for fixing things, but somebody
                    writing "the search is slow" while standing on a recipe
                    should not have to send that recipe along with it.
                */}
                {path && (
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted">
                        <span>
                            {t('fromPage')}{' '}
                            <code className="font-mono text-ink">{path}</code>
                        </span>

                        <button
                            type="button"
                            onClick={() => setPath(null)}
                            className="underline underline-offset-4 hover:text-ink"
                        >
                            {t('dropPage')}
                        </button>
                    </p>
                )}

                <button type="submit" disabled={busy || body.trim() === ''} className={buttonPrimary}>
                    {busy ? t('sending') : t('send')}
                </button>
            </form>
        </main>
    );
}
