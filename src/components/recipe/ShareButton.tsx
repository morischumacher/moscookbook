'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
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
 * What is shared is a link that works for the person receiving it. Until now
 * the button handed over the address of the page when no public link existed,
 * which sent whoever you had shared with to a sign-in form — the share looked
 * like it had worked and had not. So for an admin the public link is now made
 * at the moment of sharing, in the same tap. Asking twice gives the same link
 * back, and it can still be withdrawn from the panel further down the page.
 *
 * The one cost is a rung of the ladder below: `navigator.share` must be called
 * while the browser is still handling the tap, and creating the link takes a
 * round trip. Where a browser refuses the sheet after that wait, the link goes
 * to the clipboard instead — which is the second rung, and the link it copies
 * is the right one. The tap after that is instant, because by then there is a
 * link and nothing has to be awaited.
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
    createUrl,
}: {
    title: string;
    className?: string;
    /**
     * What to hand over. A recipe that already has a public link passes it
     * here, and then sharing needs no round trip at all.
     */
    url?: string;
    /**
     * Where to ask for a public link when there is none yet. Only passed for
     * somebody allowed to publish; for everybody else the button falls back to
     * the address of the page, which works between two people who both have an
     * account.
     */
    createUrl?: string;
}) {
    const t = useTranslations('Share');
    const router = useRouter();
    const [state, setState] = useState<'idle' | 'copied' | 'manual' | 'working'>('idle');
    const [url, setUrl] = useState('');
    // Remembered for the rest of the visit, so the second share of the same
    // recipe is synchronous and gets the system sheet.
    const [made, setMade] = useState('');

    // A ref, not the state below: `disabled` only takes effect after the render
    // that follows, and two taps on a phone arrive inside that gap. This is
    // read and set in the same synchronous breath, so the second tap sees it.
    const inFlight = useRef(false);

    const share = async () => {
        if (inFlight.current) return;
        inFlight.current = true;

        try {
            await doShare();
        } finally {
            inFlight.current = false;
        }
    };

    const doShare = async () => {
        let current = given || made;
        let madeNow = false;

        if (!current && createUrl) {
            setState('working');
            try {
                const res = await fetch(createUrl, { method: 'POST' });
                const data = await res.json().catch(() => null);
                if (res.ok && typeof data?.url === 'string') {
                    current = data.url;
                    madeNow = true;
                    setMade(data.url);
                }
            } catch {
                // Falls through to the page's own address, which is what this
                // did before there was a link to make.
            }
            setState('idle');
        }

        current = current || window.location.href;
        setUrl(current);

        const payload = sharePayload(title, current);

        // The panel further down the page renders from the server and still
        // believes there is no link. Refreshed after the sheet closes rather
        // than before it opens, so nothing competes with the gesture.
        const settleUp = () => {
            if (madeNow) router.refresh();
        };

        if (typeof navigator.share === 'function') {
            try {
                await navigator.share(payload);
                settleUp();
                return;
            } catch (error) {
                // Cancelling the share sheet rejects with AbortError. That is
                // a person changing their mind, not a failure, and falling back
                // to the clipboard there would be rude.
                if (error instanceof DOMException && error.name === 'AbortError') {
                    settleUp();
                    return;
                }
            }
        }

        try {
            await navigator.clipboard.writeText(current);
            setState('copied');
            window.setTimeout(() => setState('idle'), 2500);
        } catch {
            setState('manual');
        }

        settleUp();
    };

    return (
        <span className="inline-flex flex-col items-start gap-2">
            <button
                type="button"
                onClick={share}
                disabled={state === 'working'}
                className={className}
            >
                {state === 'copied'
                    ? t('copied')
                    : state === 'working'
                      ? t('preparing')
                      : t('share')}
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
