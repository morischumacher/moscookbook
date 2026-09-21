'use client';

import { useEffect, useRef, useState } from 'react';
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
    question,
    confirmLabel,
    onConfirm,
    disabled = false,
    destructive = false,
    className = '',
}: {
    /** What the button says before it is pressed. */
    label: string;
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

    useEffect(() => {
        if (!asking) return;

        confirmRef.current?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setAsking(false);
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [asking]);

    if (!asking) {
        return (
            <button
                type="button"
                onClick={() => setAsking(true)}
                disabled={disabled}
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
            <span className="text-muted">{question ?? t('sure')}</span>

            <button
                ref={confirmRef}
                type="button"
                disabled={disabled}
                onClick={() => {
                    setAsking(false);
                    void onConfirm();
                }}
                className={`font-semibold underline underline-offset-4 disabled:opacity-50 ${
                    destructive ? 'text-danger' : 'text-ink'
                }`}
            >
                {confirmLabel}
            </button>

            <button
                type="button"
                onClick={() => setAsking(false)}
                className="text-muted underline underline-offset-4 hover:text-ink"
            >
                {t('cancel')}
            </button>
        </span>
    );
}
