import { withoutSiteName } from './pageTitle';
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

/**
 * Strips a leading enumerator from a step.
 *
 * Plenty of sites write their steps as "1. Zwiebeln schneiden." inside a list
 * that is already ordered. Renumbering those without stripping produces
 * "1. 1. Zwiebeln schneiden." — which is what the variant suite caught.
 */
function withoutLeadingNumber(step: string): string {
    return step.replace(/^\s*(?:\d{1,2}\s*[.)]|[-*•])\s+/, '');
}

/**
 * The lines of a `recipeIngredient` that is a single string.
 *
 * schema.org allows Text as well as Text[], and a site that emits one string
 * usually separates the ingredients with newlines or <br>. Reading only the
 * array form silently imported a recipe with no ingredients at all.
 */
function ingredientLines(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((entry) => plainText(entry));

    if (typeof value === 'string') {
        return value
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\/\s*li\s*>/gi, '\n')
            .split('\n')
            .map((line) => plainText(line));
    }

    return [];
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

/**
 * A meta tag with its line breaks left in.
 *
 * `metaContent` collapses all whitespace, which is right for a title and wrong
 * for a caption: Instagram writes the whole recipe into `og:title` with
 * `&#10;` between the lines, and the rule-based parser is line-based. Flatten
 * it and a perfectly structured ingredient list arrives as one sentence, which
 * parses to nothing.
 *
 * So: entities decoded, runs of spaces and tabs squeezed, newlines kept, and
 * three or more of them reduced to two — a caption often has a dozen blank
 * lines before the hashtags.
 */
export function metaLines(html: string, property: string): string {
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
        'i'
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) return '';

    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!content) return '';

    return decodeEntities(content.replace(/<[^>]*>/g, ' '))
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Exported so a learned site profile can name a meta tag as a source. */
export function metaContent(html: string, property: string): string {
    const pattern = new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
        'i'
    );
    const tag = pattern.exec(html)?.[0];
    if (!tag) return '';
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    return content ? plainText(content) : '';
}

const LD_JSON = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Every `application/ld+json` block on the page that is valid JSON. */
function jsonLdDocuments(html: string): unknown[] {
    const documents: unknown[] = [];

    for (const block of html.matchAll(LD_JSON)) {
        try {
            // Strip CDATA wrappers some CMSs add.
            const raw = block[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
            documents.push(JSON.parse(raw));
        } catch {
            continue;
        }
    }

    return documents;
}

/**
 * What the page's structured data actually says.
 *
 * Purely for the diagnose script, and it exists because the line it replaces
 * lied by omission. "has JSON-LD: yes" was a regex looking for the string
 * `application/ld+json`, printed in green, directly above "ingredients: 0".
 * Read together those two lines say the parser is broken. They were both
 * correct: the page carries JSON-LD describing a *blog post*, and there is no
 * `Recipe` in it anywhere, so there was nothing for the rules to find.
 *
 * Which of those two it is decides what to do next — fix a parser, or accept
 * that this page only works with a model — so the diagnostic now says which.
 */
export interface JsonLdReport {
    /** Script tags found, whether or not they parsed. */
    blocks: number;
    /** How many of them were valid JSON. */
    parsed: number;
    /** Every `@type` in them, in the order first seen. */
    types: string[];
    /** Whether a `Recipe` node is reachable the way the importer looks for it. */
    hasRecipe: boolean;
}

function collectTypes(value: unknown, into: Set<string>, depth = 0): void {
    if (depth > 8 || !value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
        for (const entry of value) collectTypes(entry, into, depth + 1);
        return;
    }

    const record = value as Record<string, unknown>;
    const type = record['@type'];
    if (typeof type === 'string') into.add(type);
    if (Array.isArray(type)) {
        for (const entry of type) if (typeof entry === 'string') into.add(entry);
    }

    for (const key of Object.keys(record)) {
        if (key === '@type') continue;
        collectTypes(record[key], into, depth + 1);
    }
}

export function describeJsonLd(html: string): JsonLdReport {
    const blocks = [...html.matchAll(LD_JSON)].length;
    const documents = jsonLdDocuments(html);

    const types = new Set<string>();
    for (const document of documents) collectTypes(document, types);

    return {
        blocks,
        parsed: documents.length,
        types: [...types],
        hasRecipe: documents.some((document) => findRecipeNode(document) !== null),
    };
}

export function extractRecipeFromHtml(html: string, sourceUrl = ''): ImportedRecipe {
    for (const data of jsonLdDocuments(html)) {
        const node = findRecipeNode(data);
        if (!node) continue;

        const ingredients = ingredientLines(node.recipeIngredient)
            .map((line) => parseIngredientLine(line))
            .filter((ingredient) => ingredient.item.trim() !== '');

        const steps = collectSteps(node.recipeInstructions)
            .map(withoutLeadingNumber)
            .filter((step) => step !== '');
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
        // "Pasta Calabrese - Kochblog" is the page's title; the recipe is
        // called "Pasta Calabrese". Only a suffix that is provably the site's
        // own name is removed — see lib/pageTitle.ts, and note that this
        // applies to the *fallback* only: a site that publishes JSON-LD tells
        // us the dish's name directly and is not second-guessed.
        title: withoutSiteName(fallbackTitle, metaContent(html, 'og:site_name'), sourceUrl),
        description: metaContent(html, 'og:description') || metaContent(html, 'description'),
        imageUrl: metaContent(html, 'og:image'),
        sourceUrl,
    };
}
