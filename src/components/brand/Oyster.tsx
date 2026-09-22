/**
 * The oyster.
 *
 * It is the mark in the logo and it is what a recipe is rated in, so it had
 * better be the same oyster in both places. For a long time it was not, and
 * the person looking at both every day said so: the wordmark carries a proper
 * shell with concentric growth rings running all the way round it, and this
 * drew a blob with two short scratches near the top. Two marks, one brand.
 *
 * It used to be a 482 KB photograph drawn at 24 pixels, tinted orange with
 *
 *     filter: invert(53%) sepia(85%) saturate(3029%) hue-rotate(346deg) …
 *
 * which turns a photographic shell into a muddy blur, cannot follow dark mode,
 * and prints as a grey smudge. Drawn instead, it is about a kilobyte, takes its
 * colour from `currentColor` like any piece of text, scales to any size, and
 * prints.
 *
 * **The rings are the shell.** The previous drawing scaled a short *arc* about
 * the hinge, which is why five of them bunched into the narrow end and stopped
 * reading as anything — an attempt recorded here as "the wordmark's spacing is
 * something this construction cannot do". That was the wrong conclusion from
 * the right observation. Scaling the **outline** about a point produces exactly
 * the family a shell has: closed rings, converging where the shell grew from
 * and spreading across the broad end. Five of them at the sizes that can hold
 * five.
 *
 * The outline is pear-shaped rather than an ellipse — a soft point at the
 * lower left, broad at the upper right — because that asymmetry is most of
 * what makes the wordmark's shell look like a shell rather than a stone.
 *
 * The detail follows the size, which is not decoration either: five rings at
 * sixteen pixels is a smudge, and one ring at 512 is a bean. Rendered at every
 * size the application actually uses before this was committed.
 */

/**
 * The shell, drawn once. Everything else here is this path at a smaller scale.
 */
const SHELL =
    'M2.4 14.6 C1.9 10.4 6.8 6.3 12.6 6.2 C18.1 6.1 21.6 8.9 21.5 12.2 ' +
    'C21.4 15.7 17.0 18.1 11.6 17.9 C6.2 17.7 2.8 17.2 2.4 14.6 Z';

/**
 * Where the rings converge — the umbo, the point a shell grows out from.
 *
 * On the upper right, which is where the wordmark's are. A real oyster's rings
 * converge at the hinge, which is the pointed end; the wordmark does the
 * opposite and looks better for it, and matching the brand beats matching the
 * mollusc.
 */
const UMBO_X = 18.6;
const UMBO_Y = 8.6;

/** How much detail a given size can hold, and how heavy the line has to be. */
function detail(size: number): { rings: number[]; strokeWidth: number } {
    if (size >= 64) return { rings: [0.84, 0.68, 0.52, 0.36, 0.21], strokeWidth: 0.75 };
    if (size >= 32) return { rings: [0.8, 0.6, 0.38], strokeWidth: 1 };
    if (size >= 20) return { rings: [0.78, 0.52], strokeWidth: 1.3 };
    // At sixteen pixels a single ring is the difference between a shell and an
    // olive. Two is already mud.
    return { rings: [0.74], strokeWidth: 1.6 };
}

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
     * foreground — so fill and rings resolved to the same colour and the shell
     * rendered as a featureless blob.
     */
    cutColor?: string;
}

export default function Oyster({
    variant = 'outline',
    size = 24,
    className,
    cutColor = 'var(--color-bg)',
}: OysterProps) {
    const { rings, strokeWidth } = detail(size);

    const about = (factor: number) =>
        `translate(${UMBO_X} ${UMBO_Y}) scale(${factor}) translate(${-UMBO_X} ${-UMBO_Y})`;

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
            {/* The tilt is the wordmark's. Upright, the same drawing reads as a
                dish rather than as something that was picked up. */}
            <g transform="rotate(-14 12 12)">
                <path
                    d={SHELL}
                    fill={variant === 'solid' ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                />

                {rings.map((factor) => (
                    <path
                        key={factor}
                        d={SHELL}
                        transform={about(factor)}
                        fill="none"
                        // On a filled shell the rings are cut out of the fill,
                        // so they take the colour of whatever is behind it —
                        // exactly how the logo reads, white on orange.
                        stroke={variant === 'solid' ? cutColor : 'currentColor'}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                    />
                ))}
            </g>
        </svg>
    );
}
