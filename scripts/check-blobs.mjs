/**
 * Refuses a picture column the sweep does not know about.
 *
 *   npm run check:blobs
 *
 * scripts/sweep-blobs.mjs deletes every file in the Blob store that no row
 * points at. That is the right design — an orphaned file is billed for ever —
 * and it has one failure mode, which is catastrophic and silent: a new column
 * holding a URL that the sweep has not been told about is a column whose files
 * are **deleted on the next run**.
 *
 * Not immediately. Not with an error. A week later, when the schedule comes
 * round, and what is left is a row pointing at nothing and a broken image
 * where somebody's face was.
 *
 * Adding `avatarUrl` is what made this concrete: the column, the upload, the
 * component and the page were all written before it occurred to anybody that
 * the sweep would eat the result. It did occur, that time. This is so it does
 * not have to next time.
 *
 * Every `*Url` or `url` field of type String in the schema must either be read
 * by the sweep or be listed below with the reason it holds no file of ours.
 */
import { readFileSync } from 'fs';

const SCHEMA = 'prisma/schema.prisma';
const SWEEP = 'scripts/sweep-blobs.mjs';

/**
 * Columns that carry a URL but not one of our files.
 *
 * Each needs a reason, and the reason has to be about *where the bytes live*.
 * "It is not important" is not one: the sweep does not care how important a
 * file is, only whether something points at it.
 */
const NOT_OURS = new Map([
    [
        'Capture.sourceUrl',
        'the address a recipe was shared from — somebody else\'s page on somebody else\'s server',
    ],
]);

const schema = readFileSync(SCHEMA, 'utf8');
const sweep = readFileSync(SWEEP, 'utf8');

/** Every `Model.field` in the schema whose name looks like a URL. */
const columns = [];
let model = null;

for (const line of schema.split('\n')) {
    const starts = /^model\s+(\w+)\s*\{/.exec(line);
    if (starts) {
        model = starts[1];
        continue;
    }

    if (line.startsWith('}')) {
        model = null;
        continue;
    }

    if (!model) continue;

    // `url String`, `imageUrl  String?`. Relations and scalars other than
    // String cannot hold a blob address.
    const field = /^\s+(\w*[Uu]rl)\s+String\??\s*(\/\/.*)?$/.exec(line);
    if (field) columns.push(`${model}.${field[1]}`);
}

const problems = [];
let covered = 0;

for (const column of columns) {
    const [modelName, fieldName] = column.split('.');
    const reason = NOT_OURS.get(column);

    // `prisma.cookEntryPhoto.findMany` for `model CookEntryPhoto`.
    const accessor = modelName[0].toLowerCase() + modelName.slice(1);
    const reads = new RegExp(`prisma\\.${accessor}\\.findMany\\([^)]*${fieldName}\\s*:\\s*true`, 's');
    const isRead = reads.test(sweep);

    if (reason) {
        // An exemption that has quietly become wrong is worse than none: if
        // the sweep now reads the column, the note below is describing a
        // decision somebody has already reversed.
        if (isRead) {
            problems.push(
                `${column} is listed as not ours (${reason}),\n` +
                `    but ${SWEEP} reads it. Remove it from NOT_OURS in this script,\n` +
                '    or stop reading it there.'
            );
        }
        continue;
    }

    if (isRead) {
        covered += 1;
        continue;
    }

    problems.push(
        `${column} holds a URL but ${SWEEP} never reads it.\n` +
        '    The sweep deletes every file no row points at, so this column\'s files\n' +
        '    are deleted on the next scheduled run — silently, a week later. Either\n' +
        '    read it in referencedUrls(), or add it to NOT_OURS in this script with\n' +
        '    the reason the bytes live somewhere else.'
    );
}

if (problems.length > 0) {
    console.error('Picture columns the blob sweep does not know about:\n');
    for (const problem of problems) console.error(`  • ${problem}\n`);
    process.exit(1);
}

console.log(
    `check:blobs — ${covered} picture column(s) read by the sweep, ` +
    `${NOT_OURS.size} deliberately not ours.`
);
