#!/usr/bin/env node
/**
 * The sealed keys stay sealed, and stay in one room.
 *
 * Three API keys now live in a database column. A key is not a password hash:
 * it has to be readable, because the whole point of one is to send it
 * somewhere. So the protection is not cryptographic cleverness, it is
 * *narrowness* — one module opens the envelope, one module reads the column,
 * and everything else is handed a `provider` and a verdict.
 *
 * Narrowness is exactly the kind of property that holds for a month and then
 * quietly stops. Somebody needs the model name in a route, writes a `findMany`
 * with a `select` that has `secret: true` in it because that is what the row
 * looks like, returns the row, and three API keys are in a JSON response to an
 * admin page — where they will sit in a browser cache, a proxy log and a
 * screenshot.
 *
 * So the rules are checked rather than remembered:
 *
 *   A. `prisma.aiCredential` is touched only by `src/lib/aiConfig.ts`.
 *   B. `AiCredentialView` — the type that leaves the server — carries no key.
 *   C. `seal` and `open` are imported only by `aiConfig.ts` itself.
 *
 * Run with: npm run check:secrets
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SOURCE_DIR = 'src';
const CONFIG = 'src/lib/aiConfig.ts';
const BOX = 'src/lib/secretBox.ts';

const red = (text) => `\u001b[31m${text}\u001b[0m`;
const green = (text) => `\u001b[32m${text}\u001b[0m`;

const problems = [];

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
    }
    return out;
}

// Paths are compared with forward slashes whatever the platform joined them
// with; this check failing on Windows for a reason that is not a leak would
// teach people to ignore it.
const files = walk(SOURCE_DIR).map((file) => ({
    path: file.split('\\').join('/'),
    text: readFileSync(file, 'utf8'),
}));

/* ------------------------------------------------------- A. one reader */

for (const file of files) {
    if (file.path === CONFIG) continue;
    if (/prisma\.aiCredential\b/.test(file.text)) {
        problems.push(
            `${file.path} reads the AiCredential table directly. Go through ${CONFIG}, which is the only place the sealed column is opened.`
        );
    }
}

if (!/prisma\.aiCredential\b/.test(readFileSync(CONFIG, 'utf8'))) {
    problems.push(
        `${CONFIG} no longer reads AiCredential at all — either this check is pointed at the wrong file, or the table moved and these rules moved with it.`
    );
}

/* -------------------------------------------- B. the view carries no key */

const config = readFileSync(CONFIG, 'utf8');
const view = /export interface AiCredentialView\s*\{([\s\S]*?)\n\}/.exec(config);

if (!view) {
    problems.push(
        `${CONFIG} has no AiCredentialView interface. It is the type that leaves the server, and this check cannot verify a type it cannot find.`
    );
} else {
    // Comments stripped first: the interface is documented, and the docs
    // mention the word "key" constantly — matching those would make this
    // check fire on prose, which is how a check gets deleted.
    const body = view[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    for (const field of ['secret', 'apiKey', 'token']) {
        if (new RegExp(`\\b${field}\\s*\\??\\s*:`).test(body)) {
            problems.push(
                `AiCredentialView has a "${field}" field. That type is serialised to the admin page — nothing resembling a key belongs in it.`
            );
        }
    }
}

/* ------------------------------------------ C. the envelope opens in one place */

for (const file of files) {
    if (file.path === CONFIG || file.path === BOX) continue;

    // `import { open, seal } from './secretBox'` and every spelling of it.
    const imports = file.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*secretBox['"]/g);

    for (const match of imports) {
        const named = match[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0].trim());

        for (const name of named) {
            if (name === 'open' || name === 'seal') {
                problems.push(
                    `${file.path} imports "${name}" from secretBox. Sealing and opening belong to ${CONFIG}; everywhere else works with providers and verdicts, not with keys.`
                );
            }
        }
    }
}

/* ------------------------------------------------------------------ done */

if (problems.length > 0) {
    console.error(red(`\n${problems.length} problem(s):\n`));
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error('');
    process.exit(1);
}

console.log(green(`✓ the AI keys are read in one place and leave in none`));
