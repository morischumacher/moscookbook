'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { sharePayload } from '@/lib/sharePayload';

/**
 * Sharing a recipe.
 *
 * On a phone this opens the system share sheet, which is the thing people
 * already know how to use: WhatsApp, Signal, Messages, whatever they have.
 * Where that does not exist — most desktop browsers — the link goes to the
 * clipboard instead, and if even that is refused the URL is put on screen to be
 * copied by hand. Three rungs, because a share that silently does nothing is
 * worse than no button.
 *
 * navigator.share has to be called from the click itself: browsers only allow
 * it while a user gesture is being handled, so nothing may be awaited before
 * it.
 *
 * Only `title` and `url` are handed over, never `text`. The Web Share API lets
 * you pass all three, but what a receiving app does with them is entirely up to
 * that app: Telegram takes `text` and drops `url`, so a recipe arrived as its
 * own description with no link in sight. Nothing in the API guarantees a target
 * keeps every field, and the one field that has to survive is the link — the
 * description travels with it anyway, in the page's OpenGraph card.
 */
export default function ShareButton({
    title,
    className,
    url: given,
}: {
    title: string;
    className?: string;
    /**
     * What to hand over. Defaults to the page itself; a recipe with a public
     * link passes that instead, so the person on the other end is not sent to
     * a sign-in form.
     */
    url?: string;
}) {
    const t = useTranslations('Share');
    const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
    const [url, setUrl] = useState('');

    const share = async () => {
        const current = given || window.location.href;
        setUrl(current);

        const payload = sharePayload(title, current);

        if (typeof navigator.share === 'function') {
            try {
                await navigator.share(payload);
                return;
            } catch (error) {
                // Cancelling the share sheet rejects with AbortError. That is
                // a person changing their mind, not a failure, and falling back
                // to the clipboard there would be rude.
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }

        try {
            await navigator.clipboard.writeText(current);
            setState('copied');
            window.setTimeout(() => setState('idle'), 2500);
        } catch {
            setState('manual');
        }
    };

    return (
        <span className="inline-flex flex-col items-start gap-2">
            <button type="button" onClick={share} className={className}>
                {state === 'copied' ? t('copied') : t('share')}
            </button>

            {state === 'manual' && (
                <input
                    type="text"
                    readOnly
                    value={url}
                    aria-label={t('linkLabel')}
                    onFocus={(event) => event.currentTarget.select()}
                    // 16px, because anything smaller makes iOS Safari zoom the
                    // page when the field takes focus.
                    className="w-full min-w-0 rounded border border-control bg-transparent px-2 py-1 text-base"
                />
            )}

            {/* Announced rather than only shown, since the button's own label
                changes back after a moment. */}
            <span role="status" className="sr-only">
                {state === 'copied' ? t('copied') : ''}
            </span>
        </span>
    );
}
