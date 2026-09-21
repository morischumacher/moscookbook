#!/usr/bin/env node
/**
 * Collects real pages to test the import against.
 *
 *   npm run fixtures -- https://www.chefkoch.de/rezepte/… https://youtu.be/…
 *
 * The import is tested against hand-written schema.org, which covers the shapes
 * the specification allows but not the ones any particular site actually emits.
 * This fetches pages you would really import and keeps only the parts the
 * extractor reads:
 *
 *   - every <script type="application/ld+json"> block
 *   - the og: and description meta tags
 *   - for YouTube, the videoDetails object
 *
 * Which means a fixture is a few kilobytes rather than a megabyte, contains no
 * tracking scripts, no cookie banners and no page furniture, and is small
 * enough to read in a diff. It is still someone else's content, so fixtures
 * stay out of the repository by default — see tests/fixtures/README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'tests/fixtures';

function slugFor(url) {
    try {
        const parsed = new URL(url);
        const tail = parsed.pathname.split('/').filter(Boolean).pop() ?? 'index';
        return `${parsed.hostname.replace(/^www\./, '').replace(/\./g, '-')}-${tail}`
            .replace(/[^a-z0-9-]+/gi, '-')
            .replace(/-+/g, '-')
            .slice(0, 80)
            .toLowerCase();
    } catch {
        return `fixture-${Date.now()}`;
    }
}

/** Only what the extractor looks at, so the fixture stays small and readable. */
function reduce(html) {
    const parts = [];

    for (const match of html.matchAll(
        /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
    )) {
        parts.push(match[0]);
    }

    for (const match of html.matchAll(
        /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:[\w:]+|description|twitter:[\w:]+)["'][^>]*>/gi
    )) {
        parts.push(match[0]);
    }

    // YouTube keeps the description in the player JSON rather than in the page.
    const details = html.indexOf('"videoDetails"');
    if (details !== -1) {
        parts.push(
            `<script>var ytInitialPlayerResponse = {${html.slice(details, details + 4000)}};</script>`
        );
    }

    const title = /<title[^>]*>[\s\S]*?<\/title>/i.exec(html)?.[0];
    if (title) parts.push(title);

    return parts;
}

async function collect(url) {
    const response = await fetch(url, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; moscookbook-import/1.0)',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
        },
    });

    if (!response.ok) {
        console.error(`  HTTP ${response.status} — skipped`);
        return null;
    }

    const html = await response.text();
    const parts = reduce(html);

    if (parts.length === 0) {
        console.error('  nothing structured found on that page — skipped');
        return null;
    }

    return [
        '<!DOCTYPE html>',
        '<html><head>',
        `<!-- Reduced fixture collected from ${url} -->`,
        `<!-- Only the parts the importer reads; collected ${new Date().toISOString().slice(0, 10)} -->`,
        ...parts,
        '</head><body></body></html>',
        '',
    ].join('\n');
}

async function main() {
    const urls = process.argv.slice(2).filter((argument) => argument.startsWith('http'));

    if (urls.length === 0) {
        console.error('Usage: npm run fixtures -- <url> [<url> …]');
        process.exitCode = 1;
        return;
    }

    await mkdir(OUT, { recursive: true });

    for (const url of urls) {
        console.log(url);
        try {
            const fixture = await collect(url);
            if (!fixture) continue;

            const file = path.join(OUT, `${slugFor(url)}.html`);
            await writeFile(file, fixture, 'utf8');
            console.log(`  → ${file} (${Math.round(fixture.length / 1024)} KB)`);
        } catch (error) {
            console.error(`  ${error.message}`);
        }
    }

    console.log('\nDone. Attach the files in tests/fixtures/ and the import can be tested against them.');
}

main();
