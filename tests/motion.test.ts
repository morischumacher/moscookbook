import { suite, check } from './harness';
import { springAt, springSettled, project, rubberband, releaseVelocity, SPRING_SETTLE, SPRING_THROWN } from '../src/lib/motion';

/**
 * The physics the sheet, the lightbox and cook mode move by.
 *
 * Worth testing because a wrong sign here does not throw: it is a sheet that
 * flies off the top of the screen, or a photo that drifts away instead of
 * settling, and nobody notices until they hold a phone.
 */
export default function motionTests() {
    suite('motion');

    const near = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;

    /* ------------------------------------------------------------- springs */

    const start = springAt(0, 300, 0, 0, SPRING_SETTLE);
    check('a spring starts where it was let go', near(start.value, 300, 1e-9) && near(start.velocity, 0, 1e-9), start);

    const thrownStart = springAt(0, 0, 100, 800, SPRING_THROWN);
    check('and at the speed it was let go', near(thrownStart.velocity, 800, 1e-6), thrownStart);

    const end = springAt(2, 300, 0, 0, SPRING_SETTLE);
    check('a spring arrives', near(end.value, 0, 0.5) && springSettled(end.value, end.velocity, 0), end);

    let lowest = Infinity;
    for (let t = 0; t <= 2; t += 1 / 120) lowest = Math.min(lowest, springAt(t, 300, 0, 0, SPRING_SETTLE).value);
    check('a critically damped spring never overshoots', lowest >= -0.01, lowest);

    let lowestThrown = Infinity;
    for (let t = 0; t <= 2; t += 1 / 120) lowestThrown = Math.min(lowestThrown, springAt(t, 300, 0, 0, SPRING_THROWN).value);
    check('a thrown spring overshoots a little, not a lot', lowestThrown < 0 && lowestThrown > -30, lowestThrown);

    const toward = springAt(0.05, 0, 100, -2000, SPRING_SETTLE);
    check('a spring released moving away first carries on that way', toward.value < 0, toward);

    // Velocity agrees with the position: a numerical derivative at a few moments.
    let derivativeOk = true;
    for (const spring of [SPRING_SETTLE, SPRING_THROWN]) {
        for (const t of [0.02, 0.1, 0.3]) {
            const h = 1e-4;
            const slope = (springAt(t + h, 250, 0, -400, spring).value - springAt(t - h, 250, 0, -400, spring).value) / (2 * h);
            if (!near(slope, springAt(t, 250, 0, -400, spring).velocity, 0.5)) derivativeOk = false;
        }
    }
    check('the reported speed is the speed it moves at', derivativeOk);

    /* ---------------------------------------------------------- projection */

    check('no speed, no throw', project(0) === 0);
    check('a flick downwards carries downwards', project(1000) > 0 && project(-1000) < 0);
    check('a scroll-like flick of 1000 px/s carries about half a screen', near(project(1000), 499, 1));
    check('a snappier rate carries less', project(1000, 0.99) < project(1000));

    /* --------------------------------------------------------- rubber band */

    check('at the edge, nothing to give', rubberband(0, 400) === 0);
    check('just past it, almost 1:1', rubberband(10, 400) > 5 && rubberband(10, 400) < 10);
    check('far past it, never more than the dimension', rubberband(100000, 400) < 400);
    check('further always follows a little more', rubberband(200, 400) > rubberband(100, 400));
    check('the other way, the other sign', rubberband(-50, 400) === -rubberband(50, 400));

    /* ------------------------------------------------------------ velocity */

    check('one sample, no speed', releaseVelocity([{ at: 0, value: 0 }]) === 0);
    check(
        'a steady drag has its speed',
        near(releaseVelocity([{ at: 0, value: 0 }, { at: 50, value: 50 }, { at: 100, value: 100 }]), 1000, 1)
    );
    check(
        'only the last tenth of a second counts',
        near(
            releaseVelocity([
                { at: 0, value: 0 },
                { at: 20, value: 400 },
                { at: 300, value: 400 },
                { at: 350, value: 410 },
            ]),
            200,
            1
        )
    );
    check(
        'held still before letting go: no speed, even with no movement after the pause',
        releaseVelocity([{ at: 0, value: 0 }, { at: 30, value: 10 }, { at: 60, value: 20 }], 100, 210) === 0
    );
    check(
        'let go while moving: the speed it had',
        near(releaseVelocity([{ at: 0, value: 0 }, { at: 30, value: 30 }, { at: 60, value: 60 }], 100, 64), 937.5, 1)
    );
}
