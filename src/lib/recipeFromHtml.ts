import { parseIngredientLine } from './recipeParser';
import { isoDurationToMinutes, parseServings } from './amount';
import type { ParsedRecipe } from './recipeParser';

/**
 * Extracts a recipe from a page's HTML using the schema.org/Recipe JSON-LD that
 * most food blogs and recipe sites embed for Google. No AI involved.
 */

export interface ImportedRecipe extends ParsedRecipe {
    imageUrl: string;
    category: string;
    nationality: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    sourceUrl: string;
}

const EMPTY: Omit<ImportedRecipe, 'sourceUrl'> = {
    title: '',
    description: '',
    ingredients: [],
    instructions: '',
    imageUrl: '',
    category: '',
    nationality: '',
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
};

const HTML_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
    eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', deg: '°',
};

function decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        }
        if (entity.startsWith('#')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        }
        return HTML_ENTITIES[entity] ?? match;
    });
}

function plainText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return decodeEntities(value.replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function firstString(value: unknown): string {
    if (typeof value === 'string') return plainText(value);
    if (Array.isArray(value)) {
        for (const entry of value) {
            const result = firstString(entry);
            if (result) return result;
        }
        return '';
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        // ImageObject and friends carry the value under `url` or `name`.
        return firstString(record.url ?? record.contentUrl ?? record.name ?? '');
    }
    return '';
}

/** Flattens instruction shapes: string, string[], HowToStep[], HowToSection[]. */
function collectSteps(value: unknown, depth = 0): string[] {
    if (depth > 4) return [];

    if (typeof value === 'string') {
        // Some sites put the whole method in one string. Turn block-level tags
        // and line breaks into step boundaries *before* collapsing whitespace,
        // otherwise every step merges into one paragraph.
        const withBreaks = value
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\/\s*(?:p|li|div|h[1-6]|tr)\s*>/gi, '\n');

        return decodeEntities(withBreaks.replace(/<[^>]*>/g, ' '))
            .split(/\n+/)
            .map((part) => part.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry) => collectSteps(entry, depth + 1));
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (record.itemListElement) return collectSteps(record.itemListElement, depth + 1);
        const text = plainText((record.text ?? record.name) as string);
        return text ? [text] : [];
    }

    return [];
}

function isRecipeNode(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') return false;
    const type = (value as Record<string, unknown>)['@type'];
    if (typeof type === 'string') return type.toLowerCase() === 'recipe';
    if (Array.isArray(type)) {
        return type.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'recipe');
    }
    return false;
}

function findRecipeNode(value: unknown, depth = 0): Record<string, unknown> | null {
    if (depth > 6 || !value || typeof value !== 'object') return null;

    if (isRecipeNode(value)) return value;

    if (Array.isArray(value)) {
        for (const entry of value) {
            const found = findRecipeNode(entry, depth + 1);
            if (found) return found;
        }
        return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
        if (key in record) {
            const found = findRecipeNode(record[key], depth + 1);
            if (found) return found;
        }
    }

    return null;
}

function metaContent(html: string, property: string): string {
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
        'i'
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) return '';
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    return content ? plainText(content) : '';
}

export function extractRecipeFromHtml(html: string, sourceUrl = ''): ImportedRecipe {
    const blocks = [
        ...html.matchAll(
            /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        ),
    ];

    for (const block of blocks) {
        let data: unknown;
        try {
            // Strip CDATA wrappers some CMSs add.
            const raw = block[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
            data = JSON.parse(raw);
        } catch {
            continue;
        }

        const node = findRecipeNode(data);
        if (!node) continue;

        const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [])
            .map((entry) => parseIngredientLine(plainText(entry)))
            .filter((ingredient) => ingredient.item.trim() !== '');

        const steps = collectSteps(node.recipeInstructions);
        const instructions =
            steps.length > 1
                ? steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
                : steps[0] ?? '';

        return {
            title: firstString(node.name),
            description: firstString(node.description),
            ingredients,
            instructions,
            imageUrl: firstString(node.image),
            category: firstString(node.recipeCategory),
            nationality: firstString(node.recipeCuisine),
            servings: parseServings(node.recipeYield),
            prepMinutes: isoDurationToMinutes(node.prepTime),
            // Fall back to totalTime when a site only publishes the sum.
            cookMinutes:
                isoDurationToMinutes(node.cookTime) ?? isoDurationToMinutes(node.totalTime),
            sourceUrl,
        };
    }

    // No structured data: fall back to the social preview tags so the form is
    // at least partly filled in rather than empty.
    const fallbackTitle = metaContent(html, 'og:title') || plainText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');

    return {
        ...EMPTY,
        title: fallbackTitle,
        description: metaContent(html, 'og:description') || metaContent(html, 'description'),
        imageUrl: metaContent(html, 'og:image'),
        sourceUrl,
    };
}

/** Blocks loopback and private ranges so the importer cannot be pointed inwards. */
export function isSafePublicUrl(candidate: string): boolean {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return false;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

    const host = url.hostname.toLowerCase();

    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
        return false;
    }
    if (host === '[::1]' || host === '::1') return false;

    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (a === 127 || a === 10 || a === 0) return false;
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 192 && b === 168) return false;
        if (a === 169 && b === 254) return false;
        if (a === 100 && b >= 64 && b <= 127) return false;
    }

    return true;
}
