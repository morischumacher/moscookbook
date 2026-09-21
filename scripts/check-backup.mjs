#!/usr/bin/env node
/**
 * Every table is either in the backup or named as deliberately left out.
 *
 * This exists because of a real failure, and a quiet one. The blog and the
 * cooked photographs were built, shipped and used, and the export kept writing
 * a file with nothing but recipes in it. Nothing broke; the backups simply
 * stopped covering the newest thing anybody had written, and the way you find
 * that out is by needing one.
 *
 * A model added from now on fails this check until somebody decides which it
 * is. Deciding takes a minute; noticing in a year takes everything written in
 * between.
 */
import { readFileSync } from 'node:fs';

const SCHEMA = 'prisma/schema.prisma';
const EXPORT = 'src/app/api/export/route.ts';

/**
 * Models that are on purpose not in a backup, each with the reason. A reason
 * that stops being true is a reason to move the model out of this list.
 */
const NOT_BACKED_UP = new Map([
    ['User', 'accounts and password hashes; a restore makes new ones'],
    ['AuthToken', 'minutes-long reset links; meaningless the moment they are exported'],
    ['Invite', 'single-use links tied to the installation that issued them'],
    ['Rating', 'belongs to the people here, not to the recipes'],
    ['Favorite', 'the same'],
    ['Capture', 'the inbox is a queue, not a record; what mattered became a recipe'],
    ['CaptureToken', 'device keys, stored as hashes and revocable'],
    ['ErrorLog', 'a log of what broke in this deployment'],
    ['Image', "carried inside each recipe's entry rather than as its own list"],
    ['Ingredient', 'the same'],
]);

const schema = readFileSync(SCHEMA, 'utf8');
const exportRoute = readFileSync(EXPORT, 'utf8');

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);

const problems = [];
let covered = 0;

for (const model of models) {
    // `prisma.cookPhoto.findMany` for `model CookPhoto`.
    const accessor = model[0].toLowerCase() + model.slice(1);
    const queried = new RegExp(`prisma\\.${accessor}\\.find`).test(exportRoute);

    if (queried) {
        covered += 1;

        if (NOT_BACKED_UP.has(model)) {
            problems.push(
                `${model} is in the export but also listed as deliberately left out.\n` +
                '    Take it out of NOT_BACKED_UP in scripts/check-backup.mjs.'
            );
        }
        continue;
    }

    if (!NOT_BACKED_UP.has(model)) {
        problems.push(
            `${model} is in the schema but the export never reads it.\n` +
            `    Either query it in ${EXPORT} and carry it in the archive, or add it\n` +
            '    to NOT_BACKED_UP in scripts/check-backup.mjs with the reason it is not\n' +
            '    worth keeping. A backup that silently stops covering new data is the\n' +
            '    one failure a backup exists to prevent.'
        );
    }
}

// A name in the list that no longer exists is a stale exemption, and a stale
// exemption is how a model gets exempted by accident after a rename.
for (const model of NOT_BACKED_UP.keys()) {
    if (!models.includes(model)) {
        problems.push(
            `${model} is listed as deliberately not backed up, but there is no such model.\n` +
            '    Remove it from NOT_BACKED_UP in scripts/check-backup.mjs.'
        );
    }
}

if (problems.length > 0) {
    console.error('\x1b[31mBackup coverage:\x1b[0m\n');
    for (const problem of problems) console.error(`  • ${problem}\n`);
    process.exit(1);
}

console.log(
    `check:backup — ${covered} of ${models.length} models in the archive, ` +
    `${NOT_BACKED_UP.size} deliberately not.`
);
