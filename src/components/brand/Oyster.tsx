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
 * sixteen pixels is a smudge, and one ring at 512 is a bean.
 *
 * **The geometry lives in lib/oysterMark.ts** so that a script can render what
 * this component draws rather than its own copy of it. The previous tuning was
 * checked by a script that reimplemented the ladder, the two agreed at every
 * size except the smallest, and the smallest is the one on the rating badge —
 * which shipped as a white sliver because the single ring, being the outline
 * scaled to 0.74, had eaten the shell it was drawn on.
 */

import { SHELL, detail, ringTransform } from '@/lib/oysterMark';

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
                        transform={ringTransform(factor)}
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
