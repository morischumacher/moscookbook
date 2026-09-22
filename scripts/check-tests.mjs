#!/usr/bin/env node
/**
 * Every test file runs.
 *
 * `tests/run.ts` registers suites by hand — an import and an entry in a
 * list — because the harness is forty lines and a directory scan would be
 * the biggest part of it. The cost of by-hand is that a file can exist and
 * never run: added, forgotten, green forever. Nothing in the run would say
 * so, since a suite that does not run reports no failures.
 *
 * This says so. Every `tests/*.test.ts` must be imported in `run.ts` and its
 * default export must appear in the suites list. Files that export extra
 * suites (a second named export that is also a suite) are covered by the
 * import check, since the named export would be unused otherwise and lint
 * would refuse it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const runner = readFileSync(join('tests', 'run.ts'), 'utf8');
const files = readdirSync('tests').filter((name) => name.endsWith('.test.ts'));

const problems = [];

for (const file of files) {
    const specifier = `./${file.replace(/\.ts$/, '')}`;
    const imported = new RegExp(`from '${specifier.replace('.', '\\.')}';`).test(runner);
    if (!imported) {
        problems.push(`${file} is never imported by tests/run.ts — it does not run.`);
        continue;
    }
    // The default import's local name must appear in the suites list.
    const m = new RegExp(`import (\\w+)(?:, \\{[^}]*\\})? from '${specifier.replace('.', '\\.')}';`).exec(runner);
    if (m) {
        const name = m[1];
        if (!new RegExp(`\\['${name}', ${name}\\]`).test(runner)) {
            problems.push(`${file} is imported as ${name} but ${name} is not in the suites list — it does not run.`);
        }
    }
}

if (problems.length > 0) {
    console.error('\x1b[31mTests that never run:\x1b[0m\n');
    for (const problem of problems) console.error(`  • ${problem}`);
    process.exit(1);
}

console.log(`\x1b[32mcheck:tests — ${files.length} test files, all registered.\x1b[0m`);
