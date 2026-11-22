'use client';

import { springAt, springSettled, SPRING_SETTLE, type Spring } from '@/lib/motion';

/**
 * One number that moves like a spring, frame by frame (lib/motion.ts has the
 * physics and why it is a spring).
 *
 * What it is for: something a finger can hold. `set` while the finger is down,
 * `to` when it lets go, with the finger's speed. Catching it mid-flight is
 * `stop`, which leaves `value` and `velocity` where they are on screen at that
 * moment, so the next drag starts from there rather than from the target — a
 * sheet that is closing can be grabbed and it stays under the finger.
 *
 * `apply` writes the number to the page (a transform, an opacity) without
 * going through React: a state update per frame would re-render the sheet's
 * whole contents sixty times a second.
 */
export interface SpringValue {
    readonly value: number;
    readonly velocity: number;
    readonly animating: boolean;
    set(value: number): void;
    to(target: number, options?: { velocity?: number; spring?: Spring; onRest?: () => void }): void;
    stop(): void;
}

export function springValue(apply: (value: number) => void, initial = 0): SpringValue {
    let value = initial;
    let velocity = 0;
    let frame = 0;

    const stop = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
    };

    return {
        get value() {
            return value;
        },
        get velocity() {
            return velocity;
        },
        get animating() {
            return frame !== 0;
        },
        set(next) {
            stop();
            value = next;
            velocity = 0;
            apply(value);
        },
        to(target, { velocity: initialVelocity = velocity, spring = SPRING_SETTLE, onRest } = {}) {
            stop();
            const from = value;
            const startVelocity = initialVelocity;
            let start = 0;

            const step = (now: number) => {
                if (!start) start = now;
                // Capped, so a tab that was in the background does not jump a
                // whole second in one frame when it comes back.
                const t = Math.min((now - start) / 1000, 10);
                const state = springAt(t, from, target, startVelocity, spring);
                value = state.value;
                velocity = state.velocity;

                if (springSettled(value, velocity, target)) {
                    value = target;
                    velocity = 0;
                    apply(value);
                    frame = 0;
                    onRest?.();
                    return;
                }

                apply(value);
                frame = requestAnimationFrame(step);
            };

            frame = requestAnimationFrame(step);
        },
        stop,
    };
}

/** The reader asked for less motion: slide less, fade instead. */
export function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Keeps a drag's moves coming to the element even when the finger leaves it.
 * Throws if that pointer has already gone (lifted between two events); the
 * drag then simply carries on without it, rather than the gesture breaking.
 */
export function capturePointer(element: Element, pointerId: number): void {
    try {
        element.setPointerCapture(pointerId);
    } catch {
        // The pointer is no longer active: nothing to capture.
    }
}
