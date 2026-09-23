'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { buttonPrimary, chip, pageContainer, pageHeading, pageTop } from '@/lib/ui';
import { safeTicketPath } from '@/lib/ticketPath';
import { BusyLabel } from '@/components/ui/Busy';
import PhotoPicker from '@/components/ui/PhotoPicker';

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
function TicketForm() {
    const t = useTranslations('Tickets');

    const [kind, setKind] = useState<(typeof KINDS)[number]>('idea');

    /*
     * A description that is already written, when whoever sent you here knew
     * what the ticket was about.
     *
     * The inbox uses this: a capture that came back wrong is the case where
     * "report this" has to be one tap, because the alternative is typing out
     * which of forty rows you meant, what state it was in and where it came
     * from — which is the moment most tickets stop being written.
     *
     * Pre-filled rather than submitted: it is a draft in a text box, and the
     * person can delete every word of it. Trimmed to the same ceiling the
     * field has, so a runaway query string cannot produce a form that refuses
     * itself.
     */
    const about = useSearchParams().get('about');
    const [body, setBody] = useState(about ? about.slice(0, 2000) : '');
    /*
     * Where they were, handed over by the link rather than guessed.
     *
     * This read `document.referrer` and that was wrong in a way that only
     * showed up in use: the referrer belongs to the document, the App Router
     * changes pages without loading a new document, and the home-screen icon
     * starts a fresh one at the front page. So a ticket opened from the home
     * screen arrived stamped with whatever recipe had been open when the app
     * was last cold-started — which is worse than an empty field, because an
     * empty field is ignored and a confident wrong one is followed.
     *
     * components/TicketLink.tsx puts the real path in the query string.
     */
    const fromQuery = useSearchParams().get('from');

    // The same rule the route applies, so what is shown is what is stored.
    const [path, setPath] = useState<string | null>(safeTicketPath(fromQuery));
    const [photos, setPhotos] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const send = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, body, path, photos }),
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

                {/* A screenshot says in one picture what takes a paragraph. */}
                <PhotoPicker photos={photos} onChange={setPhotos} />

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
                    <BusyLabel busy={busy} busyText={t('sending')}>{t('send')}</BusyLabel>
                </button>
            </form>
        </main>
    );
}

/**
 * `useSearchParams` reads something only the browser knows, so the subtree
 * that uses it has to be allowed to render later than the page itself.
 */
export default function TicketsPage() {
    return (
        <Suspense fallback={null}>
            <TicketForm />
        </Suspense>
    );
}
