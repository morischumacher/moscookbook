'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useDialogFocus } from './useDialogFocus';
import { capturePointer, prefersReducedMotion, springValue, type SpringValue } from './springValue';
import { project, releaseVelocity, rubberband, SPRING_SETTLE, SPRING_THROWN } from '@/lib/motion';

/**
 * A card that rises from the bottom of a phone (and sits in the middle of a
 * wider screen) holding one thing to do: a menu of a page's quieter actions,
 * or a small form that does not deserve a page of its own.
 *
 * Built so pages stop stacking every section and every button underneath
 * each other: the page shows what it is for, and the rest is a tap on "…"
 * away, all in one place.
 *
 * How it moves, because a sheet is something people hold:
 *
 * - It comes up from the bottom and goes back down the same way — out the way
 *   it came in — whether it is closed with ×, a tap beside it, Escape or a
 *   swipe. It used to appear and vanish between two frames.
 * - Its top (the grabber and the title row) can be pulled down. It follows the
 *   finger exactly, and on letting go a flick counts as well as a distance:
 *   where the throw would carry it (lib/motion `project`) decides whether it
 *   closes or springs back. Pulled up it resists (rubber band) instead of
 *   stopping dead.
 * - It can be caught while it is moving: the drag starts from where the card
 *   is on screen, not from where it was going.
 * - With reduced motion it fades instead of sliding.
 *
 * Only the top is a handle, not the whole card: the card scrolls, and a phone
 * hands a vertical drag inside a scrolling box to the scrolling.
 */

/** When the last sheet went away. A sheet replacing another keeps the dimming rather than flashing it. */
let lastClosedAt = 0;

type Drag = { id: number; startY: number; from: number; active: boolean; samples: { at: number; value: number }[] };

export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const t = useTranslations('Dialog');
    const card = useRef<HTMLDivElement>(null);
    const backdrop = useRef<HTMLDivElement>(null);
    const offset = useRef<SpringValue | null>(null);
    const closing = useRef(false);
    const onCloseRef = useRef(onClose);
    const drag = useRef<Drag | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    /** How far the card can travel: its own height, so "closed" is just out of sight. */
    const travel = () => Math.max(card.current?.offsetHeight ?? 400, 1);

    /** Phone layout: the card slides. Wider, it sits in the middle and fades. */
    const slides = () => window.matchMedia('(max-width: 639px)').matches && !prefersReducedMotion();

    const paint = useCallback((y: number) => {
        const box = card.current;
        if (!box) return;
        const progress = Math.min(Math.max(1 - y / travel(), 0), 1);
        if (slides()) {
            box.style.transform = `translate3d(0, ${y}px, 0)`;
            box.style.opacity = '';
        } else {
            // Centred: the same number, read as a fade and a slight scale.
            box.style.transform = prefersReducedMotion() ? '' : `scale(${0.96 + 0.04 * progress})`;
            box.style.opacity = String(progress);
        }
        if (backdrop.current) backdrop.current.style.opacity = String(progress);
    }, []);

    // Before the first paint: start below the screen (or invisible), then rise.
    useLayoutEffect(() => {
        const value = springValue(paint, travel());
        offset.current = value;
        const swapping = performance.now() - lastClosedAt < 150;
        value.set(travel());
        if (swapping && backdrop.current) backdrop.current.style.opacity = '1';
        value.to(0, { spring: SPRING_SETTLE });
        return () => {
            value.stop();
            lastClosedAt = performance.now();
        };
    }, [paint]);

    /** Down and out, the way it came, then tell the page. */
    const dismiss = useCallback((velocity = 0) => {
        if (closing.current) return;
        closing.current = true;
        const value = offset.current;
        if (!value) {
            onCloseRef.current();
            return;
        }
        value.to(travel(), { velocity: Math.max(velocity, 0), spring: SPRING_SETTLE, onRest: () => onCloseRef.current() });
    }, []);

    useDialogFocus(card, dismiss);

    // The page behind must not scroll under the sheet.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    /* ---------------------------------------------------------------- drag */

    const onPointerDown = (event: ReactPointerEvent) => {
        if (closing.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const value = offset.current;
        if (!value) return;
        // Caught mid-flight: it stays where it is on screen.
        value.stop();
        drag.current = { id: event.pointerId, startY: event.clientY, from: value.value, active: false, samples: [] };
    };

    const onPointerMove = (event: ReactPointerEvent) => {
        const state = drag.current;
        const value = offset.current;
        if (!state || !value || state.id !== event.pointerId) return;
        const dy = event.clientY - state.startY;

        // A few pixels before it counts as a drag, so a tap on × stays a tap.
        // A card caught while moving is held at once: it is already in motion.
        if (!state.active) {
            if (Math.abs(dy) < 8 && Math.abs(state.from) < 1) return;
            state.active = true;
            capturePointer(event.currentTarget as Element, event.pointerId);
        }

        const raw = state.from + dy;
        // Below its resting place it follows 1:1; above it, it resists.
        const y = raw >= 0 ? raw : rubberband(raw, 60);
        value.set(y);
        state.samples.push({ at: event.timeStamp, value: y });
        if (state.samples.length > 8) state.samples.shift();
    };

    const onPointerUp = (event: ReactPointerEvent) => {
        const state = drag.current;
        const value = offset.current;
        drag.current = null;
        if (!state || !value || state.id !== event.pointerId) return;

        if (!state.active) {
            // A tap that caught the card mid-flight: let it finish arriving.
            if (Math.abs(value.value) >= 1 && !closing.current) value.to(0);
            return;
        }

        suppressClick.current = true;
        const velocity = releaseVelocity(state.samples, 100, event.timeStamp);
        const landing = value.value + project(velocity);

        if (landing > travel() * 0.5) dismiss(velocity);
        // Thrown back up: a trace of overshoot, because the finger gave it momentum.
        else value.to(0, { velocity, spring: SPRING_THROWN });
    };

    return (
        // To the bottom of what is visible (dvh), not of the layout viewport:
        // on an iPhone Safari's toolbar floats over that, and covered the
        // sheet's last rows (work #52).
        <div
            className="fixed inset-x-0 top-0 z-[200] flex h-[100dvh] items-end justify-center sm:items-center sm:p-4"
            onPointerDown={(event) => {
                if (!card.current?.contains(event.target as Node)) dismiss();
            }}
        >
            {/* The dimming is a layer of its own so it can fade with the card. */}
            <div ref={backdrop} aria-hidden className="absolute inset-0 bg-scrim/40" style={{ opacity: 0 }} />
            <div
                ref={card}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-page px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl sm:pt-5"
                style={{ transform: 'translate3d(0, 100dvh, 0)' }}
            >
                {/* The handle: grabber and title row. `touch-none` so the phone
                    hands the drag to the sheet instead of trying to scroll. */}
                <div
                    className="sticky top-0 z-10 -mx-5 mb-3 cursor-grab touch-none bg-page px-5 pt-2 active:cursor-grabbing sm:static sm:mx-0 sm:cursor-auto sm:px-0 sm:pt-0"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClickCapture={(event) => {
                        // The end of a drag that began on × is not a press of ×.
                        if (suppressClick.current) {
                            suppressClick.current = false;
                            event.stopPropagation();
                            event.preventDefault();
                        }
                    }}
                >
                    <span aria-hidden className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-control/50 sm:hidden" />
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-bold">{title}</h2>
                        <button
                            type="button"
                            onClick={() => dismiss()}
                            aria-label={t('close')}
                            className="press -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-muted hover:bg-surface hover:text-ink"
                        >
                            ×
                        </button>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}

/** One row of a sheet's menu: the width of the sheet, easy to hit. */
export const sheetItem =
    'press-row flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left font-medium hover:bg-surface active:bg-surface disabled:opacity-50';
