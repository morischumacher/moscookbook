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
import { readFileSync, existsSync } from 'node:fs';

const SCHEMA = 'prisma/schema.prisma';

/**
 * All three of them. The browser export, the weekly job and the offline
 * `npm run backup` are separate queries over the same tables, and one of them
 * had quietly stayed a version behind while another moved on — which is the
 * drift this whole file exists to make loud. Three implementations is two more
 * than anybody wants, and each exists for a reason (a download, a schedule, a
 * laptop with no time limit); this is the price of that, paid once.
 */
const EXPORTS = [
    'src/app/api/export/route.ts',
    'src/app/api/cron/backup/route.ts',
    'scripts/backup.mjs',
];

const ARCHIVE = 'src/lib/archive.ts';

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
    ['Ticket', 'remarks about this deployment of the tool, not about the cookbook: "the search is slow" restored into a fresh installation is a sentence with no referent'],
    ['Image', "carried inside each recipe's entry rather than as its own list"],
    ['Ingredient', 'the same'],
    ['RateLimit', 'counters for windows measured in minutes; restoring one would be nonsense'],
    ['AiCredential', 'sealed API keys for this deployment; an export that carried them would be an export that leaks them, and they open only under this installation\u2019s secret anyway'],
    ['AppSetting', 'knobs belonging to this deployment, like whether the AI may be asked; a restore should take the new installation\u2019s settings, not the old one\u2019s'],
    [
        'SiteProfile',
        'cached knowledge about public web pages, not content: every row can be ' +
        'rebuilt by importing from that site once more. Worth saying plainly ' +
        'that this is not free — a restore means one model call per site before ' +
        'imports are cheap again — but the export is the cookbook, and the right ' +
        'home for profiles is the planned `npm run profiles:export`, which writes ' +
        'them into the repo where they can be read, corrected and shipped',
    ],
    ['CollectionRecipe', "carried inside each collection's entry, in order, rather than as its own list"],
    ['PostRecipe', "carried inside each entry as recipeSlugs, in order, rather than as its own list"],
    ['PostCollection', "carried inside each entry as collectionSlugs, in order, rather than as its own list"],
    ['ShoppingList', 'a week of groceries, tied to an account, and accounts are not in an archive'],
    ['ShoppingItem', 'the lines of a shopping list — see ShoppingList'],
    ['CookEntryPhoto', "carried inside each cooking's entry, in order, rather than as its own list"],
]);

const schema = readFileSync(SCHEMA, 'utf8');
const sources = EXPORTS.map((file) => ({ file, text: readFileSync(file, 'utf8') }));

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);

const problems = [];
let covered = 0;

for (const model of models) {
    // `prisma.cookEntry.findMany` for `model CookEntry`.
    const accessor = model[0].toLowerCase() + model.slice(1);
    const reads = new RegExp(`prisma\\.${accessor}\\.find`);
    const missing = sources.filter((source) => !reads.test(source.text));

    if (missing.length === 0) {
        covered += 1;

        if (NOT_BACKED_UP.has(model)) {
            problems.push(
                `${model} is in the backups but also listed as deliberately left out.\n` +
                '    Take it out of NOT_BACKED_UP in scripts/check-backup.mjs.'
            );
        }
        continue;
    }

    if (NOT_BACKED_UP.has(model)) {
        // Named as not worth keeping, and none of them reads it: as intended.
        if (missing.length === sources.length) continue;

        problems.push(
            `${model} is listed as deliberately not backed up, but ` +
            `${sources.length - missing.length} of the ${sources.length} backups reads it.\n` +
            '    One of them is wrong. Decide which, in scripts/check-backup.mjs.'
        );
        continue;
    }

    problems.push(
        `${model} is in the schema but ${missing.map((source) => source.file).join(' and ')}\n` +
        '    never reads it. Either query it there and carry it in the archive, or add it\n' +
        '    to NOT_BACKED_UP in scripts/check-backup.mjs with the reason it is not\n' +
        '    worth keeping. A backup that silently stops covering new data is the\n' +
        '    one failure a backup exists to prevent.'
    );
}

/**
 * And the two have to agree on the format they are writing. They are separate
 * implementations on purpose — one runs in a serverless function, the other on
 * a laptop with no time limit — but a file that says version 1 while carrying
 * version 2's data is a file a restore will read wrongly.
 */
const declared = /ARCHIVE_VERSION\s*=\s*(\d+)/;
const inLibrary = declared.exec(readFileSync(ARCHIVE, 'utf8'))?.[1];
const inScript = declared.exec(readFileSync('scripts/backup.mjs', 'utf8'))?.[1];

if (inLibrary && inScript && inLibrary !== inScript) {
    problems.push(
        `${ARCHIVE} writes archive version ${inLibrary} but scripts/backup.mjs writes ${inScript}.\n` +
        '    They are separate implementations of one format; a file that says one\n' +
        '    version while carrying another is a file a restore reads wrongly.'
    );
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

/* ------------------------------------------------- the sweep and the backups */

/**
 * The sweep must leave the backups alone.
 *
 * Nothing in the database points at a backup — that is the whole nature of a
 * backup — which makes one look exactly like the orphaned file the sweep is
 * built to delete. Without an explicit exemption, `npm run sweep -- --delete`
 * removes every automated backup in one batch, and the thing that would have
 * saved you is the thing that went first.
 *
 * Both files take the prefix from src/lib/backupPrefix.mjs, so this checks that
 * neither has quietly gone back to a literal of its own, and that the sweep
 * still skips it.
 */
const SWEEP = 'scripts/sweep-blobs.mjs';
const PREFIX_FILE = 'src/lib/backupPrefix.mjs';
const BACKUP_ROUTE = 'src/app/api/cron/backup/route.ts';

const sweepSource = readFileSync(SWEEP, 'utf8');
const routeSource = readFileSync(BACKUP_ROUTE, 'utf8');

if (!existsSync(PREFIX_FILE)) {
    problems.push(
        `${PREFIX_FILE} is gone. It is the one place that says where backups live,\n` +
        '    and both the cron route and the sweep read it from there.'
    );
} else {
    const prefix = /BACKUP_PREFIX\s*=\s*'([^']+)'/.exec(readFileSync(PREFIX_FILE, 'utf8'))?.[1];

    if (!prefix) {
        problems.push(`${PREFIX_FILE} no longer exports a plain BACKUP_PREFIX string.`);
    } else {
        if (!sweepSource.includes('BACKUP_PREFIX')) {
            problems.push(
                `${SWEEP} does not mention BACKUP_PREFIX, so it no longer knows which files\n` +
                '    are backups. One --delete would take every one of them.'
            );
        }

        if (!/startsWith\(\s*BACKUP_PREFIX\s*\)/.test(sweepSource)) {
            problems.push(
                `${SWEEP} does not skip anything whose pathname starts with BACKUP_PREFIX.\n` +
                '    Backups are unreferenced by definition; without that test they are orphans.'
            );
        }

        if (!routeSource.includes('BACKUP_PREFIX')) {
            problems.push(
                `${BACKUP_ROUTE} writes its backups to a literal of its own rather than to\n` +
                `    BACKUP_PREFIX. When the two strings disagree, the sweep deletes the backups.`
            );
        }
    }
}

if (problems.length > 0) {
    console.error('\x1b[31mBackup coverage:\x1b[0m\n');
    for (const problem of problems) console.error(`  • ${problem}\n`);
    process.exit(1);
}

console.log(
    `check:backup — ${covered} of ${models.length} models in every backup, ` +
    `${NOT_BACKED_UP.size} deliberately not.`
);
