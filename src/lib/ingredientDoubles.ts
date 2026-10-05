import { shoppingKey } from './shopping';
import { NOISE } from './ingredientNames';

/**
 * Ingredients of the catalogue that are probably one and the same, found
 * without any AI — what the admin sees under "Mögliche Doppelungen" when
 * there is no key, or before asking one:
 *
 * - the same name in the same language ("Ingwer" twice, a plural apart);
 * - the same name across the languages, when one of the two has only that
 *   one ("Tofu" | — and — | "tofu") — not between two complete ones, where
 *   it is a false friend ("Paprika", the vegetable, and "paprika", the spice);
 * - the same once words like "frisch", "gerieben", "fresh" are left out
 *   ("Ingwer" and "frischer Ingwer");
 * - a typo apart ("Frühlingzwiebeln", "Frühlingszwiebeln").
 *
 * Deliberately not "one name inside another": "Milch" is in "Kokosmilch",
 * "Zucker" in "Puderzucker", and they are different things to buy.
 *
 * Only proposals: merging is the admin's tap, and "Ist nicht dasselbe" keeps
 * a pair from being proposed again.
 */
export interface DoubleCandidate {
    a: number;
    b: number;
    reason: 'sameName' | 'contained' | 'typo';
}

interface Named {
    id: number;
    de: string;
    en: string;
}

/** How many letters apart two names are, giving up past `max`. */
function distance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        let best = i;
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            best = Math.min(best, current[j]);
        }
        if (best > max) return max + 1;
        previous = current;
    }
    return previous[b.length];
}

export function pairKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

const plain = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const bare = (name: string) => plain(name.replace(NOISE, ' ').replace(/\b(frischer|frisches|frischem)\b/gi, ' '));

export function findDoubles(items: Named[], notDoubles: Set<string> = new Set()): DoubleCandidate[] {
    const found: DoubleCandidate[] = [];
    const complete = (item: Named) => Boolean(item.de.trim() && item.en.trim());
    for (let x = 0; x < items.length; x += 1) {
        for (let y = x + 1; y < items.length; y += 1) {
            const a = items[x];
            const b = items[y];
            if (notDoubles.has(pairKey(a.id, b.id))) continue;
            let reason: DoubleCandidate['reason'] | null = null;
            for (const language of ['de', 'en'] as const) {
                const one = a[language].trim();
                const two = b[language].trim();
                if (!one || !two) continue;
                if (shoppingKey(one) === shoppingKey(two)) reason = 'sameName';
                else if (!reason && bare(one) && bare(one) === bare(two)) reason = 'contained';
                else if (!reason) {
                    const [p, q] = [plain(one), plain(two)];
                    const shorter = Math.min(p.length, q.length);
                    if (shorter >= 5 && distance(p, q, 2) <= (shorter >= 9 ? 2 : 1)) reason = 'typo';
                }
            }
            // Across the languages only when one of them is half-done.
            if (!reason && (!complete(a) || !complete(b))) {
                const names = (item: Named) => [item.de, item.en].filter((name) => name.trim()).map((name) => shoppingKey(name));
                if (names(a).some((key) => names(b).includes(key))) reason = 'sameName';
            }
            if (reason) found.push({ a: a.id, b: b.id, reason });
        }
    }
    return found;
}
