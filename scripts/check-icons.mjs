/**
 * Refuses an application icon that does not have the oyster in it.
 *
 *   npm run check:icons
 *
 * The icons are exported from one drawing, public/brand/oyster-icon.svg, at
 * four sizes. The drawing was checked. The exports were not, and two of the
 * four shipped broken:
 *
 *   - apple-icon.png, the one iOS puts on a home screen, was a **plain orange
 *     square**. The oyster was not in it at all.
 *   - icon-192.png had the oyster almost entirely outside the canvas, with a
 *     sliver of it in the bottom-right corner.
 *
 * Nothing caught it because nothing was looking: an icon is a binary that no
 * test opens and no reviewer squints at, and a wrong one looks like a design
 * decision. It was noticed on a phone, weeks later, by the person who asked
 * for it.
 *
 * So the files themselves are measured. The PNG is decoded here rather than
 * with a library, because an icon check that needs a 300 MB image toolchain
 * installed is a check that gets skipped — `zlib` ships with Node and that is
 * all this needs.
 *
 * What it asserts, for each icon:
 *
 *   1. it is the square it claims to be
 *   2. it is not one flat colour — that is the apple-icon failure exactly
 *   3. the ink is centred, within a tolerance
 *   4. the ink covers a sensible share of the square: too little is an oyster
 *      falling off the edge, too much is a drawing that has lost its margin
 */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';

/** The brand orange the oyster sits on, as the SVG sets it. */
const FIELD = [0xff, 0x4a, 0x0e];

/** How far a channel may drift and still count as the field, for JPEG-ish noise. */
const TOLERANCE = 24;

const ICONS = [
    ['src/app/icon.png', 512, 'the browser tab'],
    ['src/app/apple-icon.png', 180, "iOS's home screen"],
    ['public/brand/icon-192.png', 192, 'the web manifest, small'],
    ['public/brand/icon-512.png', 512, 'the web manifest, large'],
];

/**
 * Enough of a PNG reader to answer "what colour is this pixel".
 *
 * Handles what a rasteriser actually writes for a flat drawing: 8 bits per
 * channel, colour type 2 (RGB) or 6 (RGBA), not interlaced. Anything else is
 * refused loudly rather than guessed at — a decoder that silently mis-reads a
 * format would fail this check in the one direction that matters, by passing.
 */
function decodePng(buffer) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < signature.length; i += 1) {
        if (buffer[i] !== signature[i]) throw new Error('not a PNG');
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let channels = 0;
    const idat = [];

    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);

        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);

            const depth = data[8];
            const colourType = data[9];
            const interlace = data[12];

            if (depth !== 8) throw new Error(`bit depth ${depth}, expected 8`);
            if (interlace !== 0) throw new Error('interlaced PNGs are not read here');
            if (colourType === 2) channels = 3;
            else if (colourType === 6) channels = 4;
            else throw new Error(`colour type ${colourType}, expected 2 or 6`);
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }

        offset += 12 + length;
    }

    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const pixels = Buffer.alloc(height * stride);

    // Undo the per-row filters. This is the part a library would do, and it is
    // five cases out of the specification, none of them subtle.
    for (let y = 0; y < height; y += 1) {
        const filter = raw[y * (stride + 1)];
        const from = y * (stride + 1) + 1;
        const to = y * stride;

        for (let x = 0; x < stride; x += 1) {
            const value = raw[from + x];
            const left = x >= channels ? pixels[to + x - channels] : 0;
            const up = y > 0 ? pixels[to - stride + x] : 0;
            const upLeft = y > 0 && x >= channels ? pixels[to - stride + x - channels] : 0;

            let out;
            if (filter === 0) out = value;
            else if (filter === 1) out = value + left;
            else if (filter === 2) out = value + up;
            else if (filter === 3) out = value + ((left + up) >> 1);
            else if (filter === 4) {
                const p = left + up - upLeft;
                const dl = Math.abs(p - left);
                const du = Math.abs(p - up);
                const dul = Math.abs(p - upLeft);
                const nearest = dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
                out = value + nearest;
            } else throw new Error(`unknown row filter ${filter}`);

            pixels[to + x] = out & 0xff;
        }
    }

    return { width, height, channels, pixels };
}

const problems = [];

for (const [file, expected, purpose] of ICONS) {
    let image;

    try {
        image = decodePng(readFileSync(file));
    } catch (error) {
        problems.push(`${file} (${purpose}) could not be read: ${error.message}`);
        continue;
    }

    const { width, height, channels, pixels } = image;

    if (width !== expected || height !== expected) {
        problems.push(
            `${file} (${purpose}) is ${width}×${height}, but it is referenced as ${expected}×${expected}.`
        );
        continue;
    }

    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let ink = 0;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const at = y * width * channels + x * channels;
            const isField =
                Math.abs(pixels[at] - FIELD[0]) <= TOLERANCE &&
                Math.abs(pixels[at + 1] - FIELD[1]) <= TOLERANCE &&
                Math.abs(pixels[at + 2] - FIELD[2]) <= TOLERANCE;

            if (isField) continue;

            ink += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    const share = ink / (width * height);

    if (ink === 0) {
        problems.push(
            `${file} (${purpose}) is a plain orange square — the oyster is not in it.`
        );
        continue;
    }

    // Between a tenth and half the square. Below that the shell is falling off
    // an edge; above it, it has grown into the margin the mark needs.
    if (share < 0.1 || share > 0.5) {
        problems.push(
            `${file} (${purpose}): the oyster covers ${(share * 100).toFixed(1)}% of the square, ` +
            'which is outside the 10–50% a centred mark occupies.'
        );
        continue;
    }

    const centreX = (minX + maxX) / 2 / width;
    const centreY = (minY + maxY) / 2 / height;

    // Six percent of the width. The mark is drawn slightly off-square on
    // purpose — it is rotated — so this is not asking for perfection, only for
    // the difference between "a little low" and "in the corner".
    if (Math.abs(centreX - 0.5) > 0.06 || Math.abs(centreY - 0.5) > 0.06) {
        problems.push(
            `${file} (${purpose}): the oyster sits at (${centreX.toFixed(2)}, ${centreY.toFixed(2)}) ` +
            'rather than near the middle. It is cropped by the edge of the canvas.'
        );
    }
}

if (problems.length > 0) {
    console.error('Application icons:\n');
    for (const problem of problems) console.error(`  • ${problem}\n`);
    console.error(
        '  All four are exported from public/brand/oyster-icon.svg. Re-export them\n' +
        '  at the sizes above rather than resampling one into another.\n'
    );
    process.exit(1);
}

console.log(`check:icons — ${ICONS.length} icons, the oyster is in all of them and centred.`);
