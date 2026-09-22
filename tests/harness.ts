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

/**
 * Whether the run is inside GitHub Actions, which reads a line of the form
 * `::error::message` off stdout and turns it into an annotation on the PR.
 * Without it a failure is four letters in a log nobody scrolls; with it the
 * failure is on the pull request's front page.
 */
const ANNOTATE = process.env.GITHUB_ACTIONS === 'true';

function reportFailure(name: string, detail: string) {
    failures++;
    const where = currentSuite ? `${currentSuite}: ` : '';
    // stderr, so a failure can be found with `2>` even in a run that prints
    // two thousand `ok` lines around it.
    console.error(`  FAIL ${where}${name}${detail}`);
    if (ANNOTATE) console.log(`::error title=${where}${name}::${detail.trim() || 'check failed'}`);
}

export function check(name: string, condition: boolean | undefined, detail?: unknown) {
    if (condition) {
        passes++;
        console.log(`  ok   ${name}`);
        return;
    }

    reportFailure(name, detail === undefined ? '' : ` → got ${JSON.stringify(detail)}`);
}

/**
 * Says what was wanted as well as what was got. `check` cannot — it is
 * handed a boolean — but this one has both sides and used to show one.
 */
export function equal(name: string, actual: unknown, expected: unknown) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        passes++;
        console.log(`  ok   ${name}`);
        return;
    }
    reportFailure(name, ` → expected ${e}, got ${a}`);
}

/**
 * A suite that threw rather than failed.
 *
 * Counted as one failure with the suite's name, so the run continues to the
 * next suite and the summary is still printed. Before this, one throw
 * anywhere skipped every later suite and printed a stack trace in place of
 * a tally.
 */
export function crashed(suiteName: string, error: unknown) {
    currentSuite = suiteName;
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    reportFailure('suite threw', ` → ${message.split('\n').slice(0, 6).join('\n')}`);
}

export function summary(): number {
    const line =
        failures === 0
            ? `\n${passes} checks passed.`
            : `\n${failures} of ${passes + failures} checks FAILED.`;
    console.log(line);
    if (ANNOTATE && failures > 0) console.log(`::error title=tests::${failures} of ${passes + failures} checks failed`);
    return failures;
}
