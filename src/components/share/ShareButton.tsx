'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ShareDialog from './ShareDialog';
import { useCopy } from '@/components/ui/useCopy';
import { sharePayload } from '@/lib/sharePayload';
import type { ShareKind } from '@/lib/shareStage';

/**
 * Share.
 *
 * It opens the dialog. Always — including when there is already a perfectly
 * good link to hand over, and that is the decision this component exists to
 * carry.
 *
 * What it used to do: on a private recipe, for an admin, it minted a permanent
 * public link *as a side effect of being pressed*, then opened the system
 * share sheet with it. One tap, no question asked, and nothing on screen said
 * a link had come into existence. On a public recipe it shared the address
 * instead; on somebody else's it fell back to the page's own URL, which sends
 * the recipient to a sign-in form. Three behaviours behind one word.
 *
 * Now it does one thing, and the dialog says who can see this before anything
 * is handed over. The cost is a tap; see the dialog's own note.
 *
 * **Except for a reader who can change nothing.** Somebody holding a shared
 * link has no stages to choose between — there is exactly one address they
 * could pass on, the one they are looking at — so for them the button still
 * shares straight away. A dialog whose every row is refused is worse than no
 * dialog.
 */
export default function ShareButton({
    id,
    kind,
    title,
    locale,
    isPublic,
    linkUrl,
    ownUrl,
    mayChange,
    className,
}: {
    id: number;
    kind: ShareKind;
    title: string;
    locale: string;
    isPublic: boolean;
    linkUrl: string | null;
    ownUrl: string;
    /** Whether this person may change who can see it. An admin, in practice. */
    mayChange: boolean;
    className?: string;
}) {
    const t = useTranslations('Share');
    const [open, setOpen] = useState(false);
    const { copy, copied } = useCopy();

    const justShare = async () => {
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share(sharePayload(title, ownUrl));
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }

        await copy(ownUrl, 'own');
    };

    return (
        <>
            <button
                type="button"
                onClick={() => (mayChange ? setOpen(true) : void justShare())}
                className={className}
            >
                {copied === 'own' ? t('copied') : t('share')}
            </button>

            {open && (
                <ShareDialog
                    id={id}
                    kind={kind}
                    title={title}
                    locale={locale}
                    isPublic={isPublic}
                    linkUrl={linkUrl}
                    ownUrl={ownUrl}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
