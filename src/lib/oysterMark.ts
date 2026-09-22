/**
 * The oyster's geometry, kept apart from the component that draws it.
 *
 * Not for reuse — one component draws this — but so that it can be *rendered
 * outside the application*. The mark exists at four sizes between fifteen and
 * five hundred pixels, and whether it reads at each of them is a question no
 * test can answer and only a picture can.
 *
 * The last time it was tuned, that picture was made by a script that
 * reimplemented the detail ladder rather than importing it. The two agreed at
 * every size except the smallest, which is the one on the rating badge, which
 * is the one somebody was looking at when they said it had gone wrong. A
 * check that rebuilds what it is checking is not a check.
 */

/** The shell, drawn once. The rings are this path at smaller scales. */
export const SHELL =
    'M2.4 14.6 C1.9 10.4 6.8 6.3 12.6 6.2 C18.1 6.1 21.6 8.9 21.5 12.2 ' +
    'C21.4 15.7 17.0 18.1 11.6 17.9 C6.2 17.7 2.8 17.2 2.4 14.6 Z';

/**
 * Where the rings converge — the point the shell grew out from.
 *
 * On the upper right, which is where the wordmark's are. A real oyster's rings
 * converge at the hinge, which is the pointed end; the wordmark does the
 * opposite and looks better for it, and matching the brand beats matching the
 * mollusc.
 */
export const UMBO = { x: 18.6, y: 8.6 };

/** The transform that turns the shell into one of its growth rings. */
export function ringTransform(factor: number): string {
    return `translate(${UMBO.x} ${UMBO.y}) scale(${factor}) translate(${-UMBO.x} ${-UMBO.y})`;
}

export interface Detail {
    /** Scale factors, outermost first. */
    rings: number[];
    /** In viewBox units, where the whole shell is 24 wide. */
    strokeWidth: number;
}

/**
 * How much detail a given drawn size can hold.
 *
 * Every number here was chosen by looking at the result at that exact size,
 * not by interpolating between two that were.
 *
 * The small end is where it goes wrong, and it goes wrong in a way that is
 * invisible in the source: a ring is the *outline* scaled down, so a ring at
 * 0.74 sits just inside the rim, and once the stroke is thick enough to be
 * seen at sixteen pixels it covers most of the shell. What shipped was a white
 * sliver with a dark body — the ring had eaten the thing it was drawn on.
 *
 * So below twenty pixels the single ring is small and central: it reads as a
 * shell with a mark in it rather than as an outline of something.
 */
export function detail(size: number): Detail {
    if (size >= 64) return { rings: [0.84, 0.68, 0.52, 0.36, 0.21], strokeWidth: 0.75 };
    if (size >= 32) return { rings: [0.8, 0.6, 0.38], strokeWidth: 1 };
    if (size >= 22) return { rings: [0.74, 0.45], strokeWidth: 1.2 };
    // Fifteen to twenty-one: the rating's small shells and the tile's badge.
    return { rings: [0.5], strokeWidth: 1.4 };
}
