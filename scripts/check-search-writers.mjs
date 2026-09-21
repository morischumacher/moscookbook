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
const WRITES = /prisma\.recipe\.(create|update|updateMany|upsert|createMany)\s*\(/;
const USES_SEARCH_FIELDS = /searchFields\s*\(/;

/**
 * Writers that do not call searchFields(), each with the reason and a marker
 * that must still be present in the file. The marker is what keeps this from
 * being a rubber stamp: if the reason stops being true, the exemption fails
 * with it rather than quietly covering a new mistake.
 */
const ALLOWED = new Map([
    [
        'src/app/api/recipes/[id]/view/route.ts',
        { why: 'increments the view counter only', marker: /views:\s*\{\s*increment/ },
    ],
    [
        'scripts/reindex-search.ts',
        { why: 'writes the columns this check is about', marker: /searchFields/ },
    ],
    [
        'scripts/restore.mjs',
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
        if (!WRITES.test(source)) continue;

        writers += 1;
        const key = relative('.', file).split('\\').join('/');

        const exemption = ALLOWED.get(key);
        if (exemption) {
            if (!exemption.marker.test(source)) {
                problems.push(
                    `${key} is exempt because it ${exemption.why}, but that is no longer\n` +
                    `    visible in the file. Either restore it, or remove the exemption\n` +
                    '    from ALLOWED in scripts/check-search-writers.mjs.'
                );
            }
            continue;
        }

        if (!USES_SEARCH_FIELDS.test(source)) {
            problems.push(
                `${key} writes a recipe but never calls searchFields().\n` +
                '    Either spread searchFields({ title, description, instructions, ingredients })\n' +
                '    into the data, or add the file to ALLOWED in scripts/check-search-writers.mjs\n' +
                '    with the reason it cannot change a recipe\'s text.'
            );
        }
    }
}

if (problems.length > 0) {
    console.error('Recipe writers missing the search columns:\n');
    for (const problem of problems) console.error(`  ${problem}\n`);
    process.exit(1);
}

console.log(`check:search — ${writers} recipe writers, all accounted for.`);
