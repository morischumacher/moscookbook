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

    suite('layers: a confirmation is above everything it can be asked from');
    // Asked from a sheet at the same z-index, it opened under it, unseen.
    const layers = files(join(__dirname, '..', 'src')).flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/\bz-\[(\d+)\]/g)].map((match) => ({ path, z: Number(match[1]) })));
    const confirm = Math.max(...layers.filter((layer) => layer.path.endsWith('useConfirm.tsx')).map((layer) => layer.z));
    const above = layers.filter((layer) => !layer.path.endsWith('useConfirm.tsx') && layer.z >= confirm);
    check(`the confirmation is the top layer${above.length ? `: ${above.map((layer) => layer.path).join(', ')}` : ''}`, above.length === 0);
}
