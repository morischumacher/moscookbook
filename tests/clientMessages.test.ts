/** Which translations reach the browser */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check } from './harness';
import { ADMIN_ONLY_NAMESPACES, SERVER_ONLY_NAMESPACES } from '../src/i18n/clientMessages';

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
}

/**
 * Where a component that uses an admin namespace may live: under the admin
 * pages, which have the full set, or in the component folders only they use.
 */
const ADMIN_PLACES = [/app\/\[locale\]\/admin\//, /components\/admin\//, /components\/recipe-form\//];

export default function clientMessagesTests() {
    suite('i18n: every component gets the words it asks for');

    const uses = files('src').flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return [...source.matchAll(/useTranslations\(['"]([A-Za-z]+)['"]\)/g)].map((match) => ({
            path,
            namespace: match[1],
        }));
    });

    check('there is something to check', uses.length > 50, uses.length);

    for (const { path, namespace } of uses) {
        if ((SERVER_ONLY_NAMESPACES as readonly string[]).includes(namespace)) {
            check(`${path} does not ask the browser for "${namespace}", which is never sent`, false);
        }
        if ((ADMIN_ONLY_NAMESPACES as readonly string[]).includes(namespace)) {
            check(
                `${path} uses "${namespace}" only where the admin provider sends it`,
                ADMIN_PLACES.some((place) => place.test(path))
            );
        }
    }
}
