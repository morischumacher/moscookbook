/**
 * The physics behind everything on the site that can be dragged.
 *
 * Three small functions, written down once so that the sheet, the lightbox and
 * cook mode move by the same rules rather than three hand-tuned guesses:
 *
 * - `springAt` — where a spring is at a given moment. A spring rather than an
 *   eased animation because it can start from wherever the thing is *now* and
 *   at whatever speed the finger left it, which is what makes a drag hand over
 *   to the animation without a seam, and lets a moving sheet be caught again.
 *   Described by Apple's two numbers instead of mass and stiffness: the damping
 *   ratio (1 = settles without overshoot, below 1 = overshoots) and the
 *   response (roughly how many seconds it takes to get there).
 * - `project` — where a flick would come to rest, with the same exponential
 *   deceleration a scrolled list has. A sheet is closed when the throw would
 *   carry it far enough, not only when it was dragged far enough.
 * - `rubberband` — resistance past an edge: the further out, the less the
 *   thing follows. A hard stop at the last photo reads as "frozen"; this reads
 *   as "there is nothing more this way".
 *
 * No DOM in here, so it is covered by `npm test` (tests/motion.test.ts).
 */

export interface Spring {
    /** 1 settles without overshoot; below 1 overshoots and swings back. */
    dampingRatio: number;
    /** Roughly the time to arrive, in seconds. Not a duration: a spring has none. */
    response: number;
}

/** The default: arrives smoothly, never overshoots. For anything that was not thrown. */
export const SPRING_SETTLE: Spring = { dampingRatio: 1, response: 0.4 };

/** A sheet or a page let go of mid-gesture: quick, with a trace of overshoot. */
export const SPRING_THROWN: Spring = { dampingRatio: 0.85, response: 0.32 };

/**
 * Position and velocity of a spring `t` seconds after it was released at
 * `from` moving at `velocity` (units per second), on its way to `to`.
 */
export function springAt(
    t: number,
    from: number,
    to: number,
    velocity: number,
    { dampingRatio, response }: Spring
): { value: number; velocity: number } {
    const omega = (2 * Math.PI) / Math.max(response, 0.01);
    const x0 = from - to;
    const v0 = velocity;

    if (dampingRatio >= 1) {
        // Critically damped (over-damped is treated the same: nobody wants slower).
        const decay = Math.exp(-omega * t);
        const b = v0 + omega * x0;
        const x = (x0 + b * t) * decay;
        const v = (b - omega * (x0 + b * t)) * decay;
        return { value: to + x, velocity: v };
    }

    const zeta = Math.max(dampingRatio, 0.05);
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * t);
    const b = (v0 + zeta * omega * x0) / omegaD;
    const cos = Math.cos(omegaD * t);
    const sin = Math.sin(omegaD * t);
    const x = decay * (x0 * cos + b * sin);
    const v = decay * (-zeta * omega * (x0 * cos + b * sin) + (-x0 * omegaD * sin + b * omegaD * cos));
    return { value: to + x, velocity: v };
}

/** Close enough to the target, and slow enough, to stop animating. */
export function springSettled(value: number, velocity: number, to: number, scale = 1): boolean {
    return Math.abs(value - to) < 0.5 * scale && Math.abs(velocity) < 5 * scale;
}

/**
 * How far a flick at `velocity` (px/s) carries before it stops, with the
 * deceleration of a scrolled list (0.998 per millisecond; 0.99 is snappier).
 */
export function project(velocity: number, decelerationRate = 0.998): number {
    return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * How far something follows when dragged `overshoot` past its edge: almost 1:1
 * at first, never more than `dimension` however far the finger goes.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
    if (dimension <= 0) return 0;
    const sign = Math.sign(overshoot);
    const distance = Math.abs(overshoot);
    return sign * ((distance * dimension * constant) / (dimension + constant * distance));
}

/**
 * The speed of a finger from its last few positions (px/s). Only the last
 * tenth of a second counts: a drag that stopped before it was let go has no
 * speed left, however fast it was earlier.
 *
 * `releasedAt` is when the finger lifted. Pass it: a finger that rests and
 * then lifts sends no movement in between, so without it the last movements
 * look as fast as they were before the pause — which closed a sheet that had
 * been pulled down a little, held, and let go.
 */
export function releaseVelocity(samples: { at: number; value: number }[], window = 100, releasedAt?: number): number {
    if (samples.length === 0) return 0;
    const all =
        releasedAt !== undefined && releasedAt > samples[samples.length - 1].at
            ? [...samples, { at: releasedAt, value: samples[samples.length - 1].value }]
            : samples;
    if (all.length < 2) return 0;
    samples = all;
    const last = samples[samples.length - 1];
    let first = last;
    for (let index = samples.length - 1; index >= 0; index--) {
        if (last.at - samples[index].at > window) break;
        first = samples[index];
    }
    const elapsed = last.at - first.at;
    if (elapsed <= 0) return 0;
    return ((last.value - first.value) / elapsed) * 1000;
}
