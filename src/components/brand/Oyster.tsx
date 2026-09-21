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
 * The line count is deliberate. Four growth rings look right at 48 pixels and
 * turn to mush at 24, which is the size that actually matters here, so there
 * are two.
 */

export interface OysterProps {
    /**
     * `outline` is the empty shell; `solid` fills it and draws the rings back
     * over the fill in the page colour, the way the logo does.
     */
    variant?: 'outline' | 'solid';
    /** Pixel size of the square. */
    size?: number;
    className?: string;
}

export default function Oyster({ variant = 'outline', size = 24, className }: OysterProps) {
    const shell =
        'M2.8 12.4 C2.8 8.8 7 6.2 12.2 6.2 C17.6 6.2 21.4 8.6 21.4 12 ' +
        'C21.4 15.4 17.4 17.9 12 17.9 C6.8 17.9 2.8 15.9 2.8 12.4 Z';

    const rings = [
        'M5.4 14.4 C4.7 13.2 5.2 11.6 6.9 10.6 C9 9.3 12.6 9 15.6 9.9 C17.9 10.6 19 11.9 18.7 13.2',
        'M8.6 15.2 C8.2 14.4 8.8 13.5 10.2 13 C11.9 12.4 14.2 12.6 15.6 13.4 C16.4 13.9 16.6 14.5 16.2 15',
    ];

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
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                />
                {rings.map((ring) => (
                    <path
                        key={ring}
                        d={ring}
                        fill="none"
                        // On a filled shell the rings are cut out of the fill, so
                        // they follow the page rather than the ink — exactly how
                        // the logo reads, white on orange.
                        stroke={variant === 'solid' ? 'var(--color-bg)' : 'currentColor'}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                    />
                ))}
            </g>
        </svg>
    );
}
