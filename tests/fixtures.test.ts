import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { stubFetch } from './stubFetch';
import { captureInputFrom } from '../src/lib/captureInput';
import { processCapture } from '../src/lib/captureProcess';

const DIRECTORY = join(__dirname, 'fixtures');

/**
 * Every fixture in tests/fixtures, driven through the real import.
 *
 * Nothing here knows what any particular page contains, and that is the point.
 * The hand-written cases cover the shapes schema.org *allows*; these cover the
 * shapes particular sites actually *emit*, which nobody can predict — so what
 * is asserted is the set of things that must hold whatever the page turned out
 * to be. A fixture that fails one of these has found a real bug, because none
 * of them is a statement about a site.
 *
 * Drop a file in with `npm run fixtures -- <url>` and it is covered from the
 * next run. An empty folder says so and passes: this suite must not be the
 * reason the build is red on a machine that has no fixtures.
 */

interface Fixture {
    name: string;
    html: string;
    /** The page it was collected from, which the collector writes in as a comment. */
    url: string;
}

function load(): Fixture[] {
    let files: string[];

    try {
        files = readdirSync(DIRECTORY).filter((name) => name.endsWith('.html'));
    } catch {
        return [];
    }

    return files
        .map((name) => {
            const html = readFileSync(join(DIRECTORY, name), 'utf8');
            const url = /<!-- Reduced fixture collected from (\S+) -->/.exec(html)?.[1] ?? '';
            return { name, html, url };
        })
        .filter((fixture) => fixture.url !== '');
}

export default async function fixtureTests() {
    suite('real pages');

    const fixtures = load();

    if (fixtures.length === 0) {
        check(
            'no fixtures collected yet — run npm run fixtures -- <url> to add some',
            true,
            'tests/fixtures/ holds only its README'
        );
        return;
    }

    for (const fixture of fixtures) {
        const restore = stubFetch({ [fixture.url]: { html: fixture.html } });

        const classified = captureInputFrom({ url: fixture.url });
        const result = classified ? await processCapture(classified) : null;
        const draft = result?.draft ?? null;
        const where = `${fixture.name} (${fixture.url})`;

        // 1. Something came back. A page reduced to its structured data and
        //    then read by our own extractor should never come out empty; if it
        //    does, the extractor cannot read that site at all.
        check(`${fixture.name}: produces a draft`, draft !== null, result?.error);

        if (!draft) {
            restore();
            continue;
        }

        // 2. It has a name, and the name is not the address. This is the exact
        //    bug the Instagram case had, and it is invisible until somebody
        //    opens the inbox and sees a row called "https://…".
        check(`${fixture.name}: has a title`, draft.title.trim() !== '', where);
        check(
            `${fixture.name}: the title is not the URL`,
            !/^https?:\/\//i.test(draft.title.trim()),
            draft.title
        );
        check(
            `${fixture.name}: the title is not the whole page`,
            draft.title.length <= 200,
            draft.title.length
        );

        // 3. Something worth keeping. Which of the two a page yields depends on
        //    the page — a video may have only a method — but neither is not an
        //    import, it is a link with a name on it.
        check(
            `${fixture.name}: has ingredients or a method`,
            draft.ingredients.length > 0 || draft.instructions.trim() !== '',
            { ingredients: draft.ingredients.length, instructions: draft.instructions.length }
        );

        // 4. No page furniture survived. Each of these has been seen in a real
        //    import, and each reads as a recipe step until you look.
        const method = draft.instructions.toLowerCase();
        for (const rubbish of ['cookie', 'javascript', 'abonnier', 'subscribe', 'werbung']) {
            check(
                `${fixture.name}: no "${rubbish}" in the method`,
                !method.includes(rubbish),
                method.slice(Math.max(0, method.indexOf(rubbish) - 40), method.indexOf(rubbish) + 40)
            );
        }

        // 5. An ingredient is a line, not a paragraph. A site that puts its
        //    whole list in one string produces exactly one very long
        //    "ingredient", which the quantity parser then makes nonsense of.
        const longest = draft.ingredients.reduce(
            (max, line) => Math.max(max, String(line).length),
            0
        );
        check(`${fixture.name}: no ingredient is a paragraph`, longest <= 200, longest);

        // 6. It remembers where it came from, or the recipe has no source.
        equal(`${fixture.name}: keeps its source`, draft.sourceUrl, fixture.url);

        // 7. A picture, when the page offered one, is a link we can render.
        if (draft.imageUrl) {
            check(
                `${fixture.name}: the picture is an http(s) link`,
                /^https?:\/\//i.test(draft.imageUrl),
                draft.imageUrl
            );
        }

        restore();
    }
}
