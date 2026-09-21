'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * "Are you sure?", asked by this application rather than by the browser.
 *
 * `window.confirm` was doing this, and it looked like what it is: a grey system
 * box with **www.moscookbook.com says** written above the question, a blue OK
 * in whatever shape the operating system likes this year, and no relation to
 * anything else on the page. It also blocks the whole tab while it is open,
 * which is why the page behind it freezes mid-scroll on a phone.
 *
 * The replacement keeps the one good thing about the native dialog — you cannot
 * carry on without answering it — and drops the rest. Escape cancels, the
 * destructive button is the one that is coloured, and Tab cannot wander off
 * into the page underneath.
 *
 * It is a hook rather than a provider because each call site already knows what
 * it is asking about, and a single global dialog would need every one of them
 * to register its wording somewhere else:
 *
 *     const [ask, dialog] = useConfirm();
 *     …
 *     const sure = await ask({ title: …, destructive: true });
 *     if (!sure) return;
 *     …
 *     return <>{dialog}…</>;
 *
 * The question itself is the caller's own translated string, which is why no
 * example above spells out a translation call: the guard that checks
 * translation keys reads comments too, and an example is not a call site.
 */

export interface ConfirmRequest {
    /** The question. One line, phrased so that "confirm" is an answer to it. */
    title: string;
    /** What else the person should know before answering. Optional. */
    body?: string;
    /** Overrides "Confirm" with the verb of the actual action. */
    confirmLabel?: string;
    /** Deletions and the like: the confirming button turns red. */
    destructive?: boolean;
    /**
     * `alert` is the same box with nothing to decide — one button, which
     * dismisses it. It replaces `window.alert`, which has the same problems as
     * `window.confirm` and one of its own: it is the only thing on the page
     * that cannot be styled at all.
     */
    kind?: 'confirm' | 'alert';
}

export function useConfirm(): [(request: ConfirmRequest) => Promise<boolean>, ReactNode] {
    const t = useTranslations('Dialog');
    const [request, setRequest] = useState<ConfirmRequest | null>(null);

    // The promise is settled by whichever button is pressed, so the resolver
    // has to outlive the render that created it.
    const settle = useRef<((answer: boolean) => void) | null>(null);
    const confirmButton = useRef<HTMLButtonElement>(null);
    const card = useRef<HTMLDivElement>(null);
    const returnFocusTo = useRef<Element | null>(null);

    const ask = useCallback((next: ConfirmRequest) => {
        returnFocusTo.current = document.activeElement;

        return new Promise<boolean>((resolve) => {
            // An earlier question left unanswered — only reachable if a call
            // site asks twice — is answered "no" rather than left hanging.
            settle.current?.(false);
            settle.current = resolve;
            setRequest(next);
        });
    }, []);

    const answer = useCallback((value: boolean) => {
        setRequest(null);
        settle.current?.(value);
        settle.current = null;

        // Back to the button that opened it, or a keyboard user is left
        // standing at the top of the document.
        if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
        returnFocusTo.current = null;
    }, []);

    useEffect(() => {
        if (!request) return;

        confirmButton.current?.focus();

        // The page behind must not scroll under the dialog, which on a phone
        // is the difference between a dialog and a floating box.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                answer(false);
                return;
            }

            if (event.key !== 'Tab') return;

            // Two buttons, so the trap is just: keep focus inside the card.
            const focusable = card.current?.querySelectorAll('button');
            if (!focusable || focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [request, answer]);

    // Unmounting with a question open — a navigation, say — settles it, so
    // nothing is left awaiting a promise that can never resolve.
    useEffect(() => {
        return () => {
            settle.current?.(false);
            settle.current = null;
        };
    }, []);

    const dialog = request ? (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
            // A tap outside is a cancel, which is what people expect of a
            // sheet on a phone. Keyboard users have Escape; this is not the
            // only way out, so it needs no role of its own.
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) answer(false);
            }}
        >
            <div
                ref={card}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby={request.body ? 'confirm-body' : undefined}
                className="w-full max-w-sm rounded-2xl border border-line bg-page p-6 shadow-2xl"
            >
                <h2 id="confirm-title" className="text-lg font-bold leading-snug text-ink">
                    {request.title}
                </h2>

                {request.body && (
                    <p id="confirm-body" className="mt-2 font-serif leading-relaxed text-muted">
                        {request.body}
                    </p>
                )}

                {/* The confirming button sits on the right, where the thumb is,
                    and cancelling is the quieter of the two. */}
                <div className="mt-6 flex justify-end gap-2">
                    {request.kind !== 'alert' && (
                        <button
                            type="button"
                            onClick={() => answer(false)}
                            className="rounded-full px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
                        >
                            {t('cancel')}
                        </button>
                    )}

                    <button
                        ref={confirmButton}
                        type="button"
                        onClick={() => answer(true)}
                        className={`rounded-full px-5 py-2.5 text-sm font-medium text-page transition-opacity hover:opacity-85 ${
                            request.destructive ? 'bg-danger' : 'bg-ink'
                        }`}
                    >
                        {request.confirmLabel ??
                            (request.kind === 'alert' ? t('ok') : t('confirm'))}
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    return [ask, dialog];
}
