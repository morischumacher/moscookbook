/**
 * A deliberately tiny test harness.
 *
 * The project has no test runner, and adding one (plus its transform config)
 * would be a bigger change than the tests themselves. These suites only need
 * to call pure functions and compare values, so a few lines do the job and
 * `npm test` stays dependency-free.
 */

let currentSuite = '';
let failures = 0;
let passes = 0;

export function suite(name: string) {
    currentSuite = name;
    console.log(`\n${name}`);
}

export function check(name: string, condition: boolean | undefined, detail?: unknown) {
    if (condition) {
        passes++;
        console.log(`  ok   ${name}`);
        return;
    }

    failures++;
    const printable = detail === undefined ? '' : ` → got ${JSON.stringify(detail)}`;
    console.log(`  FAIL ${currentSuite ? currentSuite + ': ' : ''}${name}${printable}`);
}

export function equal(name: string, actual: unknown, expected: unknown) {
    check(name, JSON.stringify(actual) === JSON.stringify(expected), actual);
}

export function summary(): number {
    console.log(
        failures === 0
            ? `\n${passes} checks passed.`
            : `\n${failures} of ${passes + failures} checks FAILED.`
    );
    return failures;
}
