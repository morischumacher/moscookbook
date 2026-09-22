import { suite, check, equal } from './harness';
import { detail, ringTransform, SHELL, UMBO } from '../src/lib/oysterMark';

/**
 * The mark's detail ladder.
 *
 * None of this can tell you whether the oyster *looks* right — only a picture
 * can, and `npm run mark:preview` draws one from this very module. What it can
 * do is hold the shape of the ladder, which is what a careless edit breaks:
 * rings that do not shrink, a size that draws nothing, a stroke that gets
 * heavier as the drawing gets bigger.
 */
export default function oysterMarkTests() {
    suite('oyster detail');

    /** The sizes this application actually draws, smallest first. */
    const SIZES = [15, 16, 20, 24, 32, 48, 64, 96, 180, 192, 512];

    for (const size of SIZES) {
        const { rings, strokeWidth } = detail(size);

        check(`${size}: draws at least one ring`, rings.length >= 1, rings);
        check(
            `${size}: every ring is inside the shell and not inverted`,
            rings.every((factor) => factor > 0 && factor < 1),
            rings
        );
        check(
            `${size}: the rings shrink, outermost first`,
            rings.every((factor, index) => index === 0 || factor < rings[index - 1]),
            rings
        );
        check(`${size}: the stroke is positive`, strokeWidth > 0, strokeWidth);
    }

    // More room, more detail — never the other way round.
    for (let i = 1; i < SIZES.length; i += 1) {
        const smaller = detail(SIZES[i - 1]);
        const larger = detail(SIZES[i]);

        check(
            `${SIZES[i]} holds at least as many rings as ${SIZES[i - 1]}`,
            larger.rings.length >= smaller.rings.length,
            [smaller.rings.length, larger.rings.length]
        );
        check(
            `${SIZES[i]} is drawn no more heavily than ${SIZES[i - 1]}`,
            larger.strokeWidth <= smaller.strokeWidth,
            [smaller.strokeWidth, larger.strokeWidth]
        );
    }

    /*
     * The bug this file was written after: at sixteen pixels the single ring
     * was 0.74 — the outline scaled just inside the rim — and once its stroke
     * was thick enough to see, it covered the shell. What shipped was a white
     * sliver.
     *
     * A ring that close to the rim is only ever right when there are several,
     * because then it reads as the outermost of a family rather than as a
     * second outline. One ring on its own has to be well inside.
     */
    for (const size of SIZES) {
        const { rings } = detail(size);
        if (rings.length > 1) continue;

        check(
            `${size}: a lone ring is well inside the rim, not a second outline`,
            rings[0] <= 0.6,
            rings[0]
        );
    }

    suite('ringTransform');

    // Scaling about the umbo is what makes the rings a family rather than a
    // set of concentric ellipses; the point has to travel into the transform.
    check('scales about the umbo', ringTransform(0.5).includes(`${UMBO.x} ${UMBO.y}`));
    check('and scales by what it was given', ringTransform(0.5).includes('scale(0.5)'));

    equal('the shell is one closed path', (SHELL.match(/Z/g) ?? []).length, 1);
    check('the shell is a path, not an ellipse element', SHELL.startsWith('M'));
}
