'use client';

import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { project, releaseVelocity, rubberband, SPRING_SETTLE, SPRING_THROWN } from '@/lib/motion';
import { capturePointer, prefersReducedMotion, springValue, type SpringValue } from './springValue';

/**
 * Sideways between pages (photos in the lightbox, steps in cook mode), and
 * optionally down to close — with the page under the finger the whole way.
 *
 * Both used to look at a swipe only once it was over: touchstart, touchend,
 * and if the finger had travelled 60 or 70 pixels the next one appeared. Nothing
 * moved while the finger did, so there was no telling whether a swipe had
 * registered until it had or had not, and a short quick flick did nothing.
 *
 * Now:
 * - after 10 px the gesture picks its direction, and from then on the page
 *   follows the finger 1:1 along it (a vertical drag in cook mode is left to
 *   the scrolling);
 * - at the first or last page it gives, with resistance, instead of stopping;
 * - on letting go, where the throw would carry it decides (lib/motion
 *   `project`): far enough, and the page carries on off the screen at the
 *   finger's speed and the next one comes in from the other side; not far
 *   enough, and it springs back;
 * - a page that is still moving can be caught;
 * - with reduced motion the new page simply replaces the old one.
 *
 * The page is moved by writing a transform to the element given `ref`
 * directly, never by React state, so dragging does not re-render what is on
 * it. Spread `handlers` on the surface that is touched (it may be larger than
 * the page: the whole lightbox, cook mode's scrolling area).
 */
export function useSwipePager({
    enabled = true,
    canPrev,
    canNext,
    onPrev,
    onNext,
    onDismiss,
    onDismissProgress,
}: {
    enabled?: boolean;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    /** Pulling down closes, when given. */
    onDismiss?: () => void;
    /** 0 → 1 as it is pulled down, for fading what is behind. */
    onDismissProgress?: (progress: number) => void;
}) {
    const latest = useRef({ canPrev, canNext, onPrev, onNext, onDismiss, onDismissProgress });
    useEffect(() => {
        latest.current = { canPrev, canNext, onPrev, onNext, onDismiss, onDismissProgress };
    });

    /** The element that moves. */
    const target = useRef<HTMLDivElement>(null);
    /** The two springs, made once the element exists. Read only in handlers and effects. */
    const springs = useRef<{ x: SpringValue; y: SpringValue } | null>(null);
    const drag = useRef<{
        id: number;
        startX: number;
        startY: number;
        fromX: number;
        fromY: number;
        axis: 'x' | 'y' | null;
        samples: { at: number; value: number }[];
    } | null>(null);
    const dragged = useRef(false);

    useLayoutEffect(() => {
        const paint = () => {
            const element = target.current;
            const both = springs.current;
            if (!element || !both) return;
            const dx = both.x.value;
            const dy = both.y.value;
            // Pulled down it also shrinks a little, the way a photo does on its way back.
            const scale = dy > 0 ? Math.max(0.85, 1 - dy / 1500) : 1;
            element.style.transform = dx === 0 && dy === 0 ? '' : `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
            const height = element.offsetHeight || window.innerHeight;
            latest.current.onDismissProgress?.(Math.min(Math.max(dy / (height * 0.5), 0), 1));
        };
        const both = { x: springValue(paint), y: springValue(paint) };
        springs.current = both;
        return () => {
            both.x.stop();
            both.y.stop();
        };
    }, []);

    // Opened again, switched on or off: from rest, with nothing left mid-way.
    useEffect(() => {
        springs.current?.x.set(0);
        springs.current?.y.set(0);
    }, [enabled]);

    const width = () => target.current?.offsetWidth || window.innerWidth;
    const height = () => target.current?.offsetHeight || window.innerHeight;

    /** Off the screen in the direction of travel, swap, and in from the other side. */
    const turn = (direction: 1 | -1, velocity: number) => {
        const spring = springs.current?.x;
        if (!spring) return;
        const change = () => (direction === 1 ? latest.current.onNext() : latest.current.onPrev());

        if (prefersReducedMotion()) {
            flushSync(change);
            spring.set(0);
            return;
        }

        const w = width();
        spring.to(-direction * w, {
            velocity,
            spring: SPRING_SETTLE,
            onRest: () => {
                // The new page is in the DOM before it is moved in.
                flushSync(change);
                spring.set(direction * w * 0.35);
                spring.to(0, { spring: SPRING_SETTLE });
            },
        });
    };

    const onPointerDown = (event: ReactPointerEvent) => {
        const both = springs.current;
        if (!enabled || !both || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const sx = both.x;
        const sy = both.y;
        // Caught while moving: it stays where it is on screen.
        const moving = sx.animating || sy.animating;
        sx.stop();
        sy.stop();
        dragged.current = false;
        drag.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            fromX: sx.value,
            fromY: sy.value,
            axis: moving ? (Math.abs(sy.value) > Math.abs(sx.value) ? 'y' : 'x') : null,
            samples: [],
        };
    };

    const onPointerMove = (event: ReactPointerEvent) => {
        const state = drag.current;
        if (!state || state.id !== event.pointerId) return;
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;

        if (!state.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
            if (Math.abs(dx) > Math.abs(dy)) state.axis = 'x';
            else if (latest.current.onDismiss && dy > 0) state.axis = 'y';
            else {
                // Up or down where nothing closes: that is the page scrolling.
                drag.current = null;
                return;
            }
            capturePointer(event.currentTarget as Element, event.pointerId);
        }

        dragged.current = true;
        const { canPrev: prev, canNext: next } = latest.current;

        if (state.axis === 'x') {
            let value = state.fromX + dx;
            // Nothing before the first or after the last: it gives, and resists.
            if (value > 0 && !prev) value = rubberband(value, width());
            if (value < 0 && !next) value = rubberband(value, width());
            springs.current?.x.set(value);
            state.samples.push({ at: event.timeStamp, value });
        } else {
            const raw = state.fromY + dy;
            const value = raw >= 0 ? raw : rubberband(raw, 80);
            springs.current?.y.set(value);
            state.samples.push({ at: event.timeStamp, value });
        }
        if (state.samples.length > 8) state.samples.shift();
    };

    const onPointerUp = (event: ReactPointerEvent) => {
        const state = drag.current;
        drag.current = null;
        const both = springs.current;
        if (!state || !both || state.id !== event.pointerId) return;
        const sx = both.x;
        const sy = both.y;

        if (!state.axis) {
            // A tap that caught something mid-flight: let it finish.
            if (sx.value !== 0) sx.to(0);
            if (sy.value !== 0) sy.to(0);
            return;
        }

        const velocity = releaseVelocity(state.samples, 100, event.timeStamp);

        if (state.axis === 'x') {
            const landing = sx.value + project(velocity);
            const w = width();
            if (landing < -w / 2 && latest.current.canNext) turn(1, velocity);
            else if (landing > w / 2 && latest.current.canPrev) turn(-1, velocity);
            else sx.to(0, { velocity, spring: SPRING_THROWN });
            return;
        }

        const landing = sy.value + project(velocity);
        if (landing > height() * 0.3 && latest.current.onDismiss) {
            const close = latest.current.onDismiss;
            if (prefersReducedMotion()) close();
            else sy.to(height(), { velocity: Math.max(velocity, 0), spring: SPRING_SETTLE, onRest: close });
        } else {
            sy.to(0, { velocity, spring: SPRING_THROWN });
        }
    };

    /** A drag that ends over a button, or over the backdrop that closes, is not a click. */
    const onClickCapture = (event: ReactMouseEvent) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
    };

    return {
        ref: target,
        handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture },
    };
}
