'use client';

import { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

/**
 * A photograph, whole.
 *
 * Every picture on this site is `object-cover` inside a fixed box, which is
 * right for a page — it keeps the layout from moving and a hero from becoming
 * a wall of food — and wrong the one time you want to look at the thing. A
 * portrait shot of a tall cake was never visible in full anywhere.
 *
 * So: tap it and it opens over the page at `object-contain`, on the ink, with
 * nothing else in the frame. Escape closes it, so does tapping the background,
 * so does the button; on a phone, so does swiping down, because that is what a
 * phone has taught everybody that a full-screen picture does.
 *
 * Swiping sideways moves between pictures, and so do the arrow keys. There are
 * two or three photographs of a dish, so there is no pagination, no counter
 * beyond "2 / 3", and no animation worth the frame budget.
 *
 * It is a client component that renders nothing until it is opened, so a
 * recipe page with a closed lightbox costs a boolean.
 *
 * Which picture is showing belongs to the gallery, not to this: mirroring a
 * prop into state means an effect that sets state on every open, and it means
 * two places that both believe they know the answer. It also gets something
 * for free — page to the third photograph in here, close it, and the gallery
 * is showing the third photograph.
 */
export default function Lightbox({
    images,
    title,
    openAt,
    onIndex,
    onClose,
}: {
    images: string[];
    title: string;
    /** Which picture to show, or null when it is closed. */
    openAt: number | null;
    /** Moving between pictures. The gallery owns which one that is. */
    onIndex: (next: number) => void;
    onClose: () => void;
}) {
    const t = useTranslations('Recipe');
    const index = openAt ?? 0;
    const closeButton = useRef<HTMLButtonElement>(null);

    // Where a touch began, so a gesture can be told from a tap.
    const touch = useRef<{ x: number; y: number } | null>(null);

    const isOpen = openAt !== null;

    const show = useCallback(
        (next: number) => {
            // Wraps, because at two pictures "next" from the last one meaning
            // nothing is just a dead button.
            onIndex((images.length + next) % images.length);
        },
        [images.length, onIndex]
    );

    // Once per opening, not per picture: this ran again on every "next",
    // which put the focus back on the close button each time and remembered
    // a button inside the dialog as what had opened it.
    useEffect(() => {
        if (!isOpen) return;

        // Back to whatever opened it, when it closes (the thumbnail).
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeButton.current?.focus();

        // The page behind must not scroll: on a phone a full-screen picture
        // that scrolls the article underneath is a picture that jumps.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
            if (opener?.isConnected && !opener.closest('[role="dialog"]')) opener.focus();
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            // Tab stays inside: the page behind is covered.
            if (event.key === 'Tab') {
                const box = closeButton.current?.closest('[role="dialog"]');
                const items = box ? [...box.querySelectorAll<HTMLElement>('button, a[href]')] : [];
                if (items.length > 0) {
                    const first = items[0];
                    const last = items[items.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
            }
            if (event.key === 'ArrowRight') show(index + 1);
            if (event.key === 'ArrowLeft') show(index - 1);
        };

        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, index, onClose, show]);

    if (!isOpen) return null;

    const many = images.length > 1;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            // `bg-ink` here meant a **white** lightbox in dark mode, which is
            // the opposite of what a lightbox is for: the surround goes dark
            // so the photograph is the only thing lit. The ink follows the
            // colour scheme; this must not. See globals.css.
            className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim"
            onClick={onClose}
            onTouchStart={(event) => {
                const point = event.touches[0];
                touch.current = { x: point.clientX, y: point.clientY };
            }}
            onTouchEnd={(event) => {
                const start = touch.current;
                touch.current = null;
                if (!start) return;

                const point = event.changedTouches[0];
                const dx = point.clientX - start.x;
                const dy = point.clientY - start.y;

                // Down closes, sideways moves, and whichever is larger wins —
                // a diagonal drag should do one thing, not both.
                if (Math.abs(dy) > Math.abs(dx) && dy > 80) {
                    onClose();
                    return;
                }

                if (many && Math.abs(dx) > 60) show(index + (dx < 0 ? 1 : -1));
            }}
        >
            {/* object-contain, which is the whole point: the picture is
                letterboxed rather than cropped, for the first time. */}
            <Image
                src={images[index]}
                alt={
                    many
                        ? t('imageOf', { number: index + 1, total: images.length, title })
                        : title
                }
                fill
                sizes="100vw"
                className="object-contain"
                priority
            />

            <button
                ref={closeButton}
                type="button"
                onClick={onClose}
                aria-label={t('closeImage')}
                // Clear of the notch and of the home indicator.
                className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim backdrop-blur-sm"
            >
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                    <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            </button>

            {many && (
                <>
                    {/* Stopping the click from reaching the backdrop, which
                        would close the thing you are paging through. */}
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            show(index - 1);
                        }}
                        aria-label={t('previousImage')}
                        className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim backdrop-blur-sm"
                    >
                        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            show(index + 1);
                        }}
                        aria-label={t('nextImage')}
                        className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-on-scrim/15 text-on-scrim backdrop-blur-sm"
                    >
                        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                    </button>

                    <p className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] text-sm tabular-nums text-on-scrim/80">
                        {index + 1} / {images.length}
                    </p>
                </>
            )}
        </div>
    );
}
