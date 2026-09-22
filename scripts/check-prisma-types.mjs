#!/usr/bin/env node
/**
 * The mistakes a local type-check cannot see.
 *
 * This container has no generated Prisma client — the engine download is
 * blocked — so `prisma` is loosely typed here and `npx tsc --noEmit` passes
 * things that fail on a machine which has run `prisma generate`. That is not a
 * theoretical gap: it shipped a red deploy.
 *
 * The rule below covers the one shape that actually bit. `$transaction([...])`
 * wants `PrismaPromise[]`, Prisma's own promise type. Delegates reached through
 * a hand-written accessor — the `table()` pattern that exists because the
 * client may not know a model yet — can only offer `Promise<unknown>`, and the
 * array form rejects them. The callback form does not care, so that is the one
 * to use whenever the delegate did not come straight off `prisma.`.
 *
 * Narrow on purpose. A guard that tried to reimplement Prisma's typing would
 * be wrong in ways nobody could check; this one asks a question with an answer.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'scripts'];
const problems = [];

function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (entry === 'node_modules' || entry === '.next') continue;
        if (statSync(path).isDirectory()) {
            walk(path);
            continue;
        }
        if (!/\.(ts|tsx|mjs)$/.test(path) || path.endsWith('check-prisma-types.mjs')) continue;

        // Comments first. The rule below is a search for a code shape, and
        // the file that fixed this bug *describes* the broken shape in its own
        // explanation — a guard that cannot tell those apart flags the fix.
        const text = readFileSync(path, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

        // A file that reaches models through an accessor rather than off
        // `prisma.` directly must not use the array form of $transaction.
        const indirect = /optionalTable<|transactionTable<|Record<string, Delegate/.test(text);
        if (indirect && /\$transaction\(\s*\[/.test(text)) {
            problems.push(
                `${path} uses $transaction([...]) while reaching models through a\n` +
                '    hand-written accessor. The array form needs Prisma\'s own PrismaPromise\n' +
                '    type, which that accessor cannot provide — it compiles here, where there\n' +
                '    is no generated client, and fails the deploy. Use the callback form:\n' +
                '    await prisma.$transaction(async (tx) => { ... }), and issue the\n' +
                '    statements on `tx`, not on the outer client.'
            );
        }
    }
}

for (const root of ROOTS) walk(root);

if (problems.length > 0) {
    console.error('\x1b[31mPrisma typing:\x1b[0m\n');
    for (const problem of problems) console.error(`  • ${problem}\n`);
    process.exit(1);
}

console.log('\x1b[32mPrisma typing OK.\x1b[0m');
