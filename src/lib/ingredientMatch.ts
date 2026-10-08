import { shoppingKey } from './shopping';
import { NOISE } from './ingredientNames';
import { LEADING_PARTICIPLE, mainShape, renamedMain, shapeOf } from './ingredientShape';
import { distance } from './ingredientDoubles';
import { mirroredAmount } from './ingredientUnits';

/**
 * How a recipe's ingredient name finds its ingredient in the catalogue
 * (lib/ingredientCatalog), with no database: the server links rows with it,
 * and the recipe form uses the same rules to say, while typing, "that is
 * Pasta, which you have" or "new — but Nudeln looks alike".
 */

/**
 * A row's name without what is not the thing: the form after the comma, the
 * notes in brackets, "(optional)", and a form written before it ("frischer
 * Ingwer") — the cookbook's convention (lib/ingredientShape).
 */
export function coreName(name: string): string {
    return shapeOf(name)
        .base.replace(/\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** "green onions/scallions" → two names; "chicken breast or firm tofu" → two names. */
export function namesIn(name: string): string[] {
    return coreName(name)
        .split(/\s*\/\s*|\s+(?:or|oder)\s+/i)
        .map((part) => part.trim())
        .filter(Boolean);
}

/** The folded forms a name may be known by: as written, and without "fresh", "fein gehackt" and the like. */
export function keysFor(name: string): string[] {
    const plain = name.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
    return [...new Set([shoppingKey(name), shoppingKey(plain)].filter(Boolean))];
}

/** Every key an item is found by: its names in both languages and its further ones. */
export function itemKeys(item: { de: string; en: string; aliases: string[]; enAliases: string[] }): string[] {
    return [...new Set([item.de, item.en, ...item.aliases, ...item.enAliases].filter((name) => name.trim()).flatMap((name) => keysFor(name)))];
}

export interface MatchableItem {
    id: number;
    de: string;
    en: string;
    /** Further German names. */
    aliases: string[];
    /** Further English names. */
    enAliases: string[];
    keys: string[];
}

/** The item a name is — every part of it the same one — or null; as the server's matchItem. */
export function matchIn<T extends MatchableItem>(name: string, items: T[]): T | null {
    const parts = namesIn(name);
    if (parts.length === 0) return null;
    let found: T | null = null;
    for (const part of parts) {
        const keys = keysFor(part);
        const item = items.find((candidate) => candidate.keys.some((key) => keys.includes(key))) ?? null;
        if (!item || (found !== null && item.id !== found.id)) return null;
        found = item;
    }
    return found;
}

/**
 * Words many ingredients share and that say nothing about which one it is:
 * "turmeric powder" is not like "onion powder" because both are powders.
 */
const GENERIC = new Set([
    'powder', 'pulver', 'sauce', 'soße', 'sosse', 'paste', 'oil', 'öl', 'oel', 'flakes', 'flocken', 'seeds', 'samen', 'juice', 'saft',
    'vinegar', 'essig', 'stock', 'brühe', 'broth', 'leaves', 'blätter', 'fresh', 'frisch', 'dried', 'getrocknet', 'ground', 'gemahlen',
    'whole', 'ganz', 'white', 'weiß', 'weiss', 'black', 'schwarz', 'red', 'rot', 'rote', 'green', 'grün', 'grüne', 'sweet', 'süß',
    'light', 'dark', 'hell', 'dunkel', 'extra', 'virgin',
]);

const plain = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Items whose name looks like a new one — to ask "a new ingredient, or one
 * of these?": a typo apart ("Frühlingzwiebeln"), one the other with a word
 * more ("Vollkornpasta" / "Pasta", "Tomaten, passiert" / "passierte
 * Tomaten"), or the same once "frisch" and the like are left out. Proposals
 * only, the closest first.
 */
export function similarIn<T extends MatchableItem>(name: string, items: T[], limit = 3): T[] {
    const core = plain(coreName(name));
    if (core.length < 3) return [];
    const words = new Set(core.split(/[\s-]+/).filter((word) => word.length >= 4 && !GENERIC.has(word)));
    const scored: { item: T; score: number }[] = [];
    for (const item of items) {
        let best = 0;
        for (const other of [item.de, item.en, ...item.aliases, ...item.enAliases].map(plain).filter((text) => text.length >= 3)) {
            if (other === core) continue;
            const shorter = Math.min(other.length, core.length);
            if (shorter >= 4 && distance(other, core, 2) <= (shorter >= 9 ? 2 : 1)) best = Math.max(best, 3);
            // A whole word of one inside the other: "Pasta" in "Vollkornpasta", "Tomaten" in "Kirschtomaten".
            else if (shorter >= 4 && !GENERIC.has(shorter === core.length ? core : other) && (other.includes(core) || core.includes(other))) best = Math.max(best, 2);
            else if ([...words].some((word) => other.split(/[\s-]+/).includes(word))) best = Math.max(best, 1);
        }
        if (best > 0) scored.push({ item, score: best });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.item);
}

/**
 * The row beside an edited one, in the recipe's other language, given the
 * list's name for the ingredient the edited row now is: "Frühlingszwiebeln,
 * gehackt" chosen above makes the English row "Spring onions, chopped" —
 * its own preparation and notes kept. The two lists are paired row for row
 * (followedRows keeps them so); when they have not the same number of rows,
 * nothing is renamed rather than the wrong row.
 */
export function syncedRows<T extends { item: string }>(rows: T[], sourceRows: { item: string }[], index: number, name: string): T[] {
    if (rows.length !== sourceRows.length) return rows;
    if (!name.trim() || !sourceRows[index]?.item.trim() || sourceRows[index].item.trim().startsWith('#')) return rows;
    const target = rows[index];
    if (!target?.item.trim() || target.item.trim().startsWith('#')) return rows;
    const shape = mainShape(target.item);
    if (shoppingKey(shape.base) === shoppingKey(name)) return rows;
    const next = [...rows];
    next[index] = { ...target, item: renamedMain(target.item, name) };
    return next;
}

/**
 * The other language's rows after an edit of this one's (`before` → `after`):
 * a row moved, added or removed here is moved, added (empty) or removed there
 * too, and every row takes this one's amount — the same numbers and units,
 * the unit word in that language (lib/ingredientUnits mirroredAmount). Rows
 * are told apart by identity, as the editor keeps them: an edited row is a
 * new one where the old one stood. Null when the other list does not line up
 * with `before` (another number of rows): then it is left as it is, rather
 * than given the amounts of the rows next to its own.
 */
export function followedRows<T extends { item: string; amount: string }>(
    before: { item: string; amount: string }[],
    after: { item: string; amount: string }[],
    other: T[],
    language: 'de' | 'en'
): T[] | null {
    if (other.length !== before.length) return null;
    const used = new Set<number>();
    const pairs = after.map((row) => {
        const at = before.indexOf(row);
        if (at === -1 || used.has(at)) return -1;
        used.add(at);
        return at;
    });
    if (before.length === after.length) {
        pairs.forEach((at, index) => {
            if (at === -1 && !used.has(index)) {
                used.add(index);
                pairs[index] = index;
            }
        });
    }
    return after.map((row, index) => {
        const at = pairs[index];
        if (at === -1) return { amount: '', item: row.item.trim().startsWith('#') ? '## ' : '' } as T;
        const mine = other[at];
        if (!row.item.trim() || row.item.trim().startsWith('#') || mine.item.trim().startsWith('#')) return mine;
        const amount = mirroredAmount(row.amount, mine.amount, language);
        return amount === mine.amount ? mine : { ...mine, amount };
    });
}

/**
 * A German name that is only the adjective of a longer one — "Fermentierte"
 * for "fermented salted shrimp", cut at a comma by the rules before
 * ingredientShape knew better. Not a name: it is emptied and filled again.
 */
export function brokenGermanName(item: { de: string; en: string }): boolean {
    const de = item.de.trim();
    // "Gehacktes", "Geschnetzeltes": a participle made a noun is a name of its own.
    if (/es$/.test(de)) return false;
    return !de.includes(' ') && LEADING_PARTICIPLE.test(de) && item.en.trim().split(/\s+/).length >= 2;
}

/**
 * The other language's rows with this one's amounts: the same numbers and
 * units, the unit word in that language (lib/ingredientUnits mirroredAmount).
 * Paired by place among the filled rows, as syncedRows.
 */
export function mirroredRows<T extends { item: string; amount: string }>(rows: T[], sourceRows: { item: string; amount: string }[], language: 'de' | 'en'): T[] {
    const sources = sourceRows.filter((row) => row.item.trim());
    let place = 0;
    return rows.map((row) => {
        if (!row.item.trim()) return row;
        const source = sources[place];
        place += 1;
        if (!source || row.item.trim().startsWith('#') || source.item.trim().startsWith('#')) return row;
        const amount = mirroredAmount(source.amount, row.amount, language);
        return amount === row.amount ? row : { ...row, amount };
    });
}

