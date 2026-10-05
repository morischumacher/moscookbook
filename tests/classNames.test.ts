/** Class lists that lost the space between two names: both stop applying, silently */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { suite, check } from './harness';

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : [];
    });
}

export default function classNamesTests() {
    suite('class names: two CSS-module classes are never glued together');
    // `${styles.card}${styles.casual}` is one class nobody defined: the menu
    // card lost its whole design, on screen and on paper, for a day.
    const glued = files(join(__dirname, '..', 'src')).filter((path) => /\}\$\{styles[.[]/.test(readFileSync(path, 'utf8')));
    check(`no glued CSS-module classes${glued.length ? `: ${glued.join(', ')}` : ''}`, glued.length === 0);
}
