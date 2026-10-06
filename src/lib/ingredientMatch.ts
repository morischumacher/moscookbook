import { shoppingKey } from './shopping';
import { NOISE } from './ingredientNames';
import { shapeOf } from './ingredientShape';
import { distance } from './ingredientDoubles';

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
export function itemKeys(item: { de: string; en: string; aliases: string[] }): string[] {
    return [...new Set([item.de, item.en, ...item.aliases].filter((name) => name.trim()).flatMap((name) => keysFor(name)))];
}

export interface MatchableItem {
    id: number;
    de: string;
    en: string;
    aliases: string[];
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
        for (const other of [item.de, item.en, ...item.aliases].map(plain).filter((text) => text.length >= 3)) {
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
