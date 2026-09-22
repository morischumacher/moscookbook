import Image from 'next/image';

/**
 * A person, as a round picture or as their initials.
 *
 * The initials are not a placeholder waiting to be replaced. Most people will
 * never upload anything, and an interface that looks unfinished without a
 * photograph is one that nags — so the fallback is a finished thing: the same
 * circle, the same size, with two letters in it.
 *
 * The colour comes from the name rather than from a palette, so one person is
 * the same colour everywhere and two people in a list are usually different
 * from each other. It is a hash, not a choice, which is what makes it stable
 * without anybody storing it.
 *
 * `size` is the drawn size in pixels; the file behind it is at most 512, and
 * `sizes` tells the image pipeline that so it does not fetch a large one to
 * paint a small circle. Every rendering is square and cropped to fill, because
 * a portrait in a circle that letterboxes is a person with their head cut off.
 */
export default function Avatar({
    name,
    url,
    size = 40,
}: {
    name: string | null;
    url: string | null;
    size?: number;
}) {
    const label = (name ?? '').trim();

    // First letters of the first two words: "Moritz Schumacher" → MS, "Anna" →
    // A. Split on whitespace rather than taking the first two characters,
    // because "Anna" should not read as "AN".
    const initials =
        label
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => [...part][0] ?? '')
            .join('')
            .toUpperCase() || '·';

    if (url) {
        return (
            <Image
                src={url}
                alt=""
                width={size}
                height={size}
                sizes={`${size}px`}
                className="shrink-0 rounded-full bg-surface object-cover"
                style={{ width: size, height: size }}
            />
        );
    }

    // A hue from the name. 360 buckets, stepped by a number coprime with it so
    // that similar names do not land next to each other.
    let hash = 0;
    for (const character of label) hash = (hash * 31 + character.codePointAt(0)!) % 360;
    const hue = (hash * 47) % 360;

    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-full font-semibold text-on-scrim"
            style={{
                width: size,
                height: size,
                fontSize: Math.round(size * 0.4),
                /*
                 * Fixed saturation and lightness so that white stays legible
                 * on every hue. Not a guess: at 42% / 38% the worst hue —
                 * yellow, at 60° — gave 3.64:1, which fails the 4.5:1 that
                 * text needs. 45% / 32% makes the worst case 4.77:1, and
                 * check:contrast sweeps all 360 hues so it cannot drift back.
                 *
                 * `text-on-scrim` rather than `text-page` for the letters:
                 * these circles are the same colour in both schemes, so the
                 * text on them has to be too, or dark mode paints black
                 * initials on a dark circle.
                 */
                backgroundColor: `hsl(${hue} 45% 32%)`,
            }}
        >
            {initials}
        </span>
    );
}
