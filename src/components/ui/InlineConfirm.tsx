'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * "Sure?" asked where the button was, without covering anything.
 *
 * The first attempt at replacing `window.confirm` was a proper dialog: a dimmed
 * page and a card in the middle of it. It was better-looking than the browser's
 * grey box and still wrong, because it answered the wrong question — the
 * problem with a system dialog is not only how it looks, it is that stopping
 * the whole page is far too much ceremony for "remove this photo?".
 *
 * So the button asks in place. Press "Remove" and the word is replaced, on the
 * same line, by the question and two small answers. Nothing moves, nothing is
 * covered, nothing is dimmed, and the cost of a mis-tap is one more tap. The
 * page behind it is still there because it never went anywhere.
 *
 * Escape cancels, and so does moving focus out of it — an abandoned question
 * should not sit on the page waiting.
 *
 * The full dialog (useConfirm) is still right where an answer needs a sentence
 * of explanation, or where the thing being undone is large. This is for the
 * small, reversible, everyday ones, which is most of them.
 */
export default function InlineConfirm({
    label,
    ariaLabel,
    question,
    confirmLabel,
    onConfirm,
    disabled = false,
    destructive = false,
    className = '',
}: {
    /** What the button says before it is pressed. */
    label: string;
    /** For a label that is only a sign ("×"): what a screen reader says instead. */
    ariaLabel?: string;
    /**
     * The question. Defaults to a plain "Sure?", which is usually enough —
     * the button beside it already says what is about to happen. Pass a longer
     * one only where the consequence is not obvious from the verb.
     */
    question?: string;
    /** The answer that goes ahead: the verb, not "yes". */
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
    disabled?: boolean;
    destructive?: boolean;
    /** The styling of the resting button, so each call site keeps its own. */
    className?: string;
}) {
    const t = useTranslations('Dialog');
    const [asking, setAsking] = useState(false);
    const box = useRef<HTMLSpanElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const restingRef = useRef<HTMLButtonElement>(null);
    // Set when the answer was "no" by keyboard or button: the focus then goes
    // back where it was, rather than falling to the page when the two
    // buttons it was on disappear.
    const returnFocus = useRef(false);
    const questionId = useId();

    useEffect(() => {
        if (!asking) {
            if (returnFocus.current) restingRef.current?.focus();
            returnFocus.current = false;
            return;
        }

        confirmRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                returnFocus.current = true;
                setAsking(false);
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [asking]);

    if (!asking) {
        return (
            <button
                ref={restingRef}
                type="button"
                onClick={() => setAsking(true)}
                disabled={disabled}
                aria-label={ariaLabel}
                className={className}
            >
                {label}
            </button>
        );
    }

    return (
        <span
            ref={box}
            className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs"
            // Clicking away is an answer of "no". Checked against the box
            // rather than against a single element, because focus moves
            // between the two buttons inside it.
            onBlur={(event) => {
                if (!box.current?.contains(event.relatedTarget as Node | null)) setAsking(false);
            }}
        >
            <span id={questionId} className="text-muted">
                {question ?? t('sure')}
            </span>

            <button
                ref={confirmRef}
                type="button"
                disabled={disabled}
                // The question is read with the button focus lands on.
                aria-describedby={questionId}
                onClick={() => {
                    setAsking(false);
                    void onConfirm();
                }}
                className={`min-h-11 font-semibold underline underline-offset-4 disabled:opacity-50 ${
                    destructive ? 'text-danger' : 'text-ink'
                }`}
            >
                {confirmLabel}
            </button>

            <button
                type="button"
                onClick={() => {
                    returnFocus.current = true;
                    setAsking(false);
                }}
                className="min-h-11 text-muted underline underline-offset-4 hover:text-ink"
            >
                {t('cancel')}
            </button>
        </span>
    );
}
