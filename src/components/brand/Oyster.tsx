/**
 * The oyster.
 *
 * It is the mark in the logo and it is what a recipe is rated in, so it had
 * better be the same oyster in both places. It used to be a 482 KB photograph
 * drawn at 24 pixels, tinted orange with
 *
 *     filter: invert(53%) sepia(85%) saturate(3029%) hue-rotate(346deg) …
 *
 * which turns a photographic shell into a muddy blur, cannot follow dark mode,
 * and prints as a grey smudge. Drawn instead, it is about a kilobyte, takes its
 * colour from `currentColor` like any piece of text, scales to any size, and
 * prints.
 *
 * The line count follows the size. It used to be two everywhere, because 24
 * pixels was the size that mattered when it was written — and then the
 * home-screen icon needed one at 512, where a two-ring shell reads as a bean.
 *
 * So one drawing with two levels of detail rather than two drawings: three
 * rings once there is room, two below that. The third is the outer ring grown
 * about the hinge — the narrow end the shell actually grows out from — so it
 * stays parallel to the rim instead of looking pasted on.
 *
 * Five were tried, aiming at the wordmark's own oyster, which is a raster with
 * about seven. They were worse: scaling about one hinge bunches them into the
 * narrow end, and the shell stops being a shell. The wordmark's rings are
 * spaced evenly across the whole shell, which this construction cannot do, and
 * three is where it stops being a simplification and starts being a mess.
 */

export interface OysterProps {
    /**
     * `outline` is the empty shell; `solid` fills it and cuts the rings back
     * out of the fill, the way the logo does.
     */
    variant?: 'outline' | 'solid';
    /** Pixel size of the square. */
    size?: number;
    className?: string;
    /**
     * What colour a filled shell's rings are cut in — which has to be whatever
     * is *behind* the oyster, or they are not cuts, they are lines.
     *
     * This used to be hard-coded to `var(--color-bg)`, on the assumption that
     * an oyster always sits on the page. On the rating badge it does not: it
     * sits on a dark scrim over a photograph, filled with the scrim's own
     * foreground — so the fill and the rings resolved to the same colour and
     * the shell rendered as a featureless blob. In light mode that blob was
     * cream and nobody looked twice; in dark mode it was a black jellybean in
     * the corner of a photograph, which is how this was finally noticed.
     *
     * The default keeps every existing caller — the logo, the five shells on a
     * recipe — exactly as it was.
     */
    cutColor?: string;
}

export default function Oyster({
    variant = 'outline',
    size = 24,
    className,
    cutColor = 'var(--color-bg)',
}: OysterProps) {
    const shell =
        'M2.8 12.4 C2.8 8.8 7 6.2 12.2 6.2 C17.6 6.2 21.4 8.6 21.4 12 ' +
        'C21.4 15.4 17.4 17.9 12 17.9 C6.8 17.9 2.8 15.9 2.8 12.4 Z';

    const outer =
        'M5.4 14.4 C4.7 13.2 5.2 11.6 6.9 10.6 C9 9.3 12.6 9 15.6 9.9 C17.9 10.6 19 11.9 18.7 13.2';
    const inner =
        'M8.6 15.2 C8.2 14.4 8.8 13.5 10.2 13 C11.9 12.4 14.2 12.6 15.6 13.4 C16.4 13.9 16.6 14.5 16.2 15';

    // The hinge: the narrow end the growth rings spread out from. Scaling a
    // ring about this point gives another ring of the same family.
    const HINGE_X = 4.3;
    const HINGE_Y = 15.6;
    const about = (factor: number) =>
        `translate(${HINGE_X} ${HINGE_Y}) scale(${factor}) translate(${-HINGE_X} ${-HINGE_Y})`;

    /**
     * How much detail this size can hold. 28 is where it was drawn and looked
     * at, not a formula: below it the third ring closes up against the second
     * and the three become a smudge.
     */
    const rings: { d: string; transform?: string }[] =
        size >= 28
            ? [{ d: outer, transform: about(1.12) }, { d: outer }, { d: inner }]
            : [{ d: outer }, { d: inner }];

    // Thinner lines as the drawing grows: 1.5 at 24 pixels is what makes it
    // readable there and what would make it a cartoon at 512.
    const strokeWidth = size >= 96 ? 0.85 : size >= 28 ? 1.2 : 1.5;

    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            className={className}
            // Decorative: every place this is used labels itself in words.
            aria-hidden="true"
            focusable="false"
        >
            <g transform="rotate(-14 12 12)">
                <path
                    d={shell}
                    fill={variant === 'solid' ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                />
                {rings.map((ring, index) => (
                    <path
                        key={`${index}-${ring.transform ?? ''}`}
                        d={ring.d}
                        transform={ring.transform}
                        fill="none"
                        // On a filled shell the rings are cut out of the fill,
                        // so they take the colour of whatever is behind the
                        // shell — exactly how the logo reads, white on orange.
                        stroke={variant === 'solid' ? cutColor : 'currentColor'}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />
                ))}
            </g>
        </svg>
    );
}
