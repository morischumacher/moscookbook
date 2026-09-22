import { writeFileSync } from 'fs';
import { SHELL, detail, ringTransform } from '../src/lib/oysterMark';

/**
 * Draws the oyster at every size the application uses, into one HTML file.
 *
 *   npm run mark:preview   →   .preview-mark.html
 *
 * This exists because of a specific mistake. The mark was tuned by looking at
 * a picture, and the picture was made by a script that had its own copy of the
 * detail ladder. The two agreed at every size except the smallest — the one on
 * the rating badge — which shipped as a white sliver, because a lone ring at
 * 0.74 is the outline scaled just inside the rim and its stroke covered the
 * shell it was drawn on.
 *
 * So this imports the module the component imports. If it ever disagrees with
 * what ships, it is because somebody changed that module, which is the only
 * disagreement worth having.
 *
 * Not a test: whether a drawing reads at fifteen pixels is not a thing a test
 * can answer. tests/oysterMark.test.ts holds the shape of the ladder; this is
 * for the part that needs eyes.
 */

/** Every size the application draws, and where. */
const USES: [number, string][] = [
    [15, 'rating, small — RecipeCard on a tile with no photograph'],
    [16, 'the rating badge on a tile'],
    [24, 'rating, full size — the recipe page'],
    [64, 'the not-found page'],
    [180, 'apple-icon.png'],
    [192, 'the web manifest, small'],
    [512, 'icon.png and the manifest, large'],
];

function mark(size: number, fill: string, ring: string, drawAt = size): string {
    const { rings, strokeWidth } = detail(size);

    const family = rings
        .map(
            (factor) =>
                `<path d="${SHELL}" transform="${ringTransform(factor)}" fill="none" ` +
                `stroke="${ring}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
        )
        .join('');

    return (
        `<svg viewBox="0 0 24 24" width="${drawAt}" height="${drawAt}" style="vertical-align:middle">` +
        `<g transform="rotate(-14 12 12)">` +
        `<path d="${SHELL}" fill="${fill}" stroke="${fill === 'none' ? ring : fill}" ` +
        `stroke-width="${strokeWidth}" stroke-linejoin="round"/>${family}</g></svg>`
    );
}

const rows = USES.map(([size, where]) => {
    // Three contexts, because the mark is wrong in different ways in each:
    // filled on a dark scrim (the badge), filled in the brand colour (a
    // rating), and open on paper.
    const onScrim =
        `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.7);` +
        `color:#fff;border-radius:999px;padding:4px 10px 4px 6px;font:600 12px system-ui">` +
        `${mark(size, '#fff', '#000')}<span>5,0</span></span>`;

    return `<tr>
      <td style="padding:14px 18px;font:600 13px system-ui;white-space:nowrap">${size}px</td>
      <td style="padding:14px 18px;background:#b2874f">${onScrim}</td>
      <td style="padding:14px 18px;background:#FFF8F0">${mark(size, '#ff4a0e', '#FFF8F0')}</td>
      <td style="padding:14px 18px;background:#FFF8F0">${mark(size, 'none', '#111')}</td>
      <td style="padding:14px 18px;background:#000">${mark(size, 'none', '#EEE')}</td>
      <td style="padding:14px 18px;font:13px system-ui;color:#555">${where}
        <div style="color:#999;font-size:12px">${detail(size).rings.length} ring(s), stroke ${detail(size).strokeWidth}</div>
      </td>
    </tr>`;
}).join('');

writeFileSync(
    '.preview-mark.html',
    `<!doctype html><meta charset="utf-8"><title>oyster</title>
     <body style="margin:0;background:#fff;font-family:system-ui">
     <table style="border-collapse:collapse">${rows}</table></body>`
);

console.log('Wrote .preview-mark.html — open it.');
