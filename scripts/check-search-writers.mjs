/**
 * Fails the build when a recipe writer forgets the search columns.
 *
 *   npm run check:search
 *
 * `searchTitle` and `searchBody` are maintained by the application, not by the
 * database, so every place that creates or updates a recipe has to go through
 * searchFields(). Forgetting is silent: the recipe saves, looks right, and
 * simply never turns up in a search again. A grep is a crude guard, but it
 * catches exactly the mistake that has no other symptom.
 *
 * Writers that legitimately touch a recipe without changing its text are
 * listed below, each with the reason.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOTS = ['src', 'scripts', 'prisma'];

/**
 * Two tables now carry search columns, and both fail the same silent way. The
 * shapes differ only in which helper writes them, so they are checked by the
 * same walk rather than by a second copy of this file.
 */
const SUBJECTS = [
    {
        what: 'recipe',
        writes: /prisma\.recipe\.(create|update|updateMany|upsert|createMany)\s*\(/,
        // searchFields, but not postSearchFields — the recipe helper by name.
        uses: /(?<!post)searchFields\s*\(/i,
        helper: 'searchFields({ title, description, instructions, ingredients })',
    },
    {
        what: 'post',
        writes: /prisma\.post\.(create|update|updateMany|upsert|createMany)\s*\(/,
        uses: /postSearchFields\s*\(/,
        helper: 'postSearchFields({ title, body })',
    },
];

/**
 * Writers that do not call the helper, each with the reason and a marker that
 * must still be present in the file. The marker is what keeps this from being a
 * rubber stamp: if the reason stops being true, the exemption fails with it
 * rather than quietly covering a new mistake.
 *
 * Keyed by table *and* file, because one file can write both — the archive
 * restore does, and exempting it wholesale would take the recipe check with it.
 */
const ALLOWED = new Map([
    [
        'post src/app/api/posts/[id]/share/route.ts',
        {
            why: 'only ever sets or clears the share token',
            marker: /data:\s*\{\s*shareToken:\s*(?:token|null)\s*\}/,
        },
    ],
    [
        'post src/app/api/import/archive/route.ts',
        {
            why: 'restores entries and says so; npm run reindex fills their columns',
            marker: /npm run reindex/,
        },
    ],
    [
        'recipe src/app/api/recipes/[id]/view/route.ts',
        { why: 'increments the view counter only', marker: /views:\s*\{\s*increment/ },
    ],
    [
        'recipe src/app/api/recipes/[id]/share/route.ts',
        {
            why: 'only ever sets or clears the share token',
            // Both directions, so that widening this route to touch a recipe's
            // words would take the exemption with it.
            marker: /data:\s*\{\s*shareToken:\s*(?:token|null)\s*\}/,
        },
    ],
    [
        'recipe scripts/reindex-search.ts',
        { why: 'writes the columns this check is about', marker: /searchFields/ },
    ],
    [
        'recipe scripts/restore.mjs',
        { why: 'hands off to the reindex script afterwards', marker: /reindex-search/ },
    ],
]);

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx|mjs|js)$/.test(full)) out.push(full);
    }
    return out;
}

const problems = [];
let writers = 0;

for (const root of ROOTS) {
    let files;
    try {
        files = walk(root);
    } catch {
        continue;
    }

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        const key = relative('.', file).split('\\').join('/');

        for (const subject of SUBJECTS) {
            if (!subject.writes.test(source)) continue;

            writers += 1;
            const exemption = ALLOWED.get(`${subject.what} ${key}`);

            if (exemption) {
                if (!exemption.marker.test(source)) {
                    problems.push(
                        `${key} is exempt from the ${subject.what} check because it ${exemption.why},\n` +
                        '    but that is no longer visible in the file. Either restore it, or remove\n' +
                        '    the exemption from ALLOWED in scripts/check-search-writers.mjs.'
                    );
                }
                continue;
            }

            if (!subject.uses.test(source)) {
                problems.push(
                    `${key} writes a ${subject.what} but never calls its search helper.\n` +
                    `    Either spread ${subject.helper} into the data, or add\n` +
                    `    "${subject.what} ${key}" to ALLOWED in scripts/check-search-writers.mjs\n` +
                    `    with the reason it cannot change a ${subject.what}'s text.`
                );
            }
        }
    }
}

if (problems.length > 0) {
    console.error('Writers missing the search columns:\n');
    for (const problem of problems) console.error(`  ${problem}\n`);
    process.exit(1);
}

console.log(`check:search — ${writers} writers across ${SUBJECTS.length} tables, all accounted for.`);
