/**
 * What we have learned about how one website lays out a recipe.
 *
 * ## The idea
 *
 * The first time a site is imported from, a model reads the page and also says
 * *where on the page it found things*. That answer is stored under the
 * hostname. Every later import from that site follows the stored answer and
 * never calls a model at all — which is the point: a key becomes something
 * that makes the cookbook better over time rather than something it depends
 * on.
 *
 * ## Why the model may not describe how to read a page
 *
 * The obvious design lets the model return instructions — a selector, a bit of
 * logic, a path. That is a program written by a model, stored, and then run
 * against pages nobody looked at, and there is no way to review it that scales.
 *
 * So the model does not get to say *how*. It picks from strategies this file
 * already implements and fills in their parameters. Every strategy is a few
 * lines of code covered by tests, and the worst a bad profile can do is name a
 * heading that is not there — which is a miss, not a wrong recipe.
 *
 * ## Why the anchors are heading texts
 *
 * A CSS selector describes a page's *construction*, and construction is what
 * changes when a site is restyled. `.sqs-block-content > ul:nth-child(3)` stops
 * meaning anything the day the theme is updated, and it stops meaning it
 * silently, by matching something else. The word "Ingredients" above the
 * ingredients is a fact about the recipe, and it survives a redesign because
 * the redesign is for human readers who also need it.
 *
 * Selectors are supported as a last resort, because some pages genuinely have
 * no headings, but they are a fallback and they are marked as one.
 *
 * ## The rule that makes this safe
 *
 * A profile is never stored on the model's say-so. It is applied to the very
 * page it was learned from and compared with what the model itself extracted;
 * a profile that cannot reproduce that answer is thrown away. So every stored
 * profile has worked at least once, on real markup. See `siteLearn.ts`.
 */

import { z } from 'zod';
import { parse as parseHtml } from 'node-html-parser';

import { readableBlocks, withoutNoise, type Block } from './readableText';
import { jsonLdDocuments, metaContent } from './htmlMeta';

/* -------------------------------------------------------------------------- */
/*  The vocabulary                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bounds on what a model may write into a profile.
 *
 * Not security — the profile never becomes code — but a model that answers
 * with a paragraph where a heading belongs should fail validation rather than
 * be stored and quietly never match anything.
 */
const MAX_HEADING = 80;
const MAX_SELECTOR = 200;
const MAX_PROPERTY = 60;
const MAX_PATH = 120;

const strategySchema = z.discriminatedUnion('kind', [
    /** A `<meta>` tag: `og:title`, `og:image`, `description`. */
    z.object({
        kind: z.literal('meta'),
        property: z.string().trim().min(1).max(MAX_PROPERTY),
    }),

    /**
     * A dotted path into one of the page's `application/ld+json` documents.
     *
     * For sites that publish structured data that is *almost* a Recipe —
     * the right fields under the wrong `@type`, which the strict extractor
     * refuses and rightly so, but which a profile may name explicitly.
     */
    z.object({
        kind: z.literal('jsonLd'),
        path: z.string().trim().min(1).max(MAX_PATH),
    }),

    /** The list items following a heading, up to the next heading. */
    z.object({
        kind: z.literal('listAfterHeading'),
        heading: z.string().trim().min(1).max(MAX_HEADING),
    }),

    /** Everything following a heading, up to the next heading of its rank. */
    z.object({
        kind: z.literal('textAfterHeading'),
        heading: z.string().trim().min(1).max(MAX_HEADING),
    }),

    /** The last resort, for pages with no headings to anchor to. */
    z.object({
        kind: z.literal('selector'),
        selector: z.string().trim().min(1).max(MAX_SELECTOR),
        take: z.enum(['text', 'each']),
    }),
]);

export type Strategy = z.infer<typeof strategySchema>;

export const profileSchema = z.object({
    title: strategySchema.optional(),
    ingredients: strategySchema.optional(),
    method: strategySchema.optional(),
    image: strategySchema.optional(),
});

export type SiteProfile = z.infer<typeof profileSchema>;

/**
 * A profile with nothing in it reads nothing, and storing one would mean every
 * later import from that site silently returns an empty recipe. The two that
 * matter are named explicitly: a profile that finds a title and a picture but
 * no food is not a profile.
 */
export function isUsefulProfile(profile: SiteProfile): boolean {
    return profile.ingredients !== undefined && profile.method !== undefined;
}

/* -------------------------------------------------------------------------- */
/*  Matching a heading                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Heading texts compared the way a reader would.
 *
 * "Ingredients", "INGREDIENTS", "Ingredients:" and "Ingredients " are the same
 * heading, and a profile that matched only one of them would go stale the next
 * time an editor typed a colon.
 */
function normalise(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\s ]+/g, ' ')
        .replace(/[:：.,;!?]+\s*$/, '')
        .trim();
}

/**
 * Where a heading is, or -1.
 *
 * Exact match first, then "starts with", so that a profile anchored on
 * "Ingredients" still finds "Ingredients (for 4 people)" — a heading a site
 * edits without meaning to move anything. Exact wins when both are present, so
 * a page with both headings is not read off the wrong one.
 */
function headingAt(blocks: Block[], heading: string): number {
    const want = normalise(heading);
    if (want === '') return -1;

    let prefix = -1;

    for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (block.kind !== 'heading') continue;

        const have = normalise(block.text);
        if (have === want) return index;
        if (prefix === -1 && have.startsWith(want)) prefix = index;
    }

    return prefix;
}

/* -------------------------------------------------------------------------- */
/*  The strategies                                                            */
/* -------------------------------------------------------------------------- */

/** The items under a heading, stopping at the next heading. */
function listAfterHeading(blocks: Block[], heading: string): string[] {
    const at = headingAt(blocks, heading);
    if (at === -1) return [];

    const items: string[] = [];
    for (let index = at + 1; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (block.kind === 'heading') break;
        if (block.kind === 'item') items.push(block.text);
    }

    return items;
}

/**
 * Everything under a heading, stopping at the next heading of the same rank
 * or higher.
 *
 * Rank rather than "the next heading", because a method is very often broken
 * into sub-steps — "For the brine", "For the sandwich" — and stopping at the
 * first `<h3>` would return a method consisting of its first paragraph.
 */
function textAfterHeading(blocks: Block[], heading: string): string {
    const at = headingAt(blocks, heading);
    if (at === -1) return '';

    const anchor = blocks[at];
    const rank = anchor.kind === 'heading' ? anchor.level : 2;

    const parts: string[] = [];
    let items = 0;

    for (let index = at + 1; index < blocks.length; index += 1) {
        const block = blocks[index];
        if (block.kind === 'heading') {
            if (block.level <= rank) break;
            parts.push(block.text);
            continue;
        }
        if (block.kind === 'item') items += 1;
        parts.push(block.text);
    }

    // A method that is a list of steps is numbered, the same way the JSON-LD
    // path numbers `recipeInstructions`, so the two paths produce the same
    // shape and the recipe form does not have to know which was used.
    if (items > 1 && items === parts.length) {
        return parts.map((step, index) => `${index + 1}. ${step}`).join('\n\n');
    }

    return parts.join('\n\n');
}

/** Follows a dotted path into a value, tolerating arrays by index. */
/**
 * Segments that name the prototype chain rather than the document.
 *
 * Honest about what this buys, because the first version of this comment
 * claimed more. `atPath` only reads, so pollution was never possible. And the
 * `typeof current !== 'object'` check on every step already stops
 * `constructor.name` — `constructor` is a function, so the walk ends there and
 * nothing is returned. On a JSON-parsed object every prototype property is a
 * function, and nothing reachable through the chain is a string. Tried, not
 * reasoned: the deny-list removed, the probes still found nothing.
 *
 * So this is not closing a hole. It is a statement of intent that survives
 * the day somebody loosens the typeof check: a path into the prototype chain
 * has no business in a site profile, whatever the traversal happens to do.
 */
const FORBIDDEN_SEGMENT = new Set(['__proto__', 'constructor', 'prototype']);

function atPath(value: unknown, path: string): unknown {
    let current = value;

    for (const step of path.split('.')) {
        if (step === '') continue;
        if (FORBIDDEN_SEGMENT.has(step)) return undefined;
        if (current === null || typeof current !== 'object') return undefined;

        if (Array.isArray(current)) {
            const index = Number(step);
            if (!Number.isInteger(index)) return undefined;
            current = current[index];
        } else {
            current = (current as Record<string, unknown>)[step];
        }
    }

    return current;
}

function jsonLdValue(html: string, path: string): unknown {
    for (const data of jsonLdDocuments(html)) {
        const found = atPath(data, path);
        if (found !== undefined && found !== null && found !== '') return found;
    }

    return undefined;
}

/**
 * The selector fallback.
 *
 * Runs against the page with scripts and styles already removed, because
 * `node-html-parser` counts their contents as text and `.content p` on a raw
 * page can otherwise return a stylesheet. An invalid selector throws rather
 * than matching nothing, so it is caught and treated as a miss.
 */
function bySelector(html: string, selector: string, take: 'text' | 'each'): string[] {
    try {
        const root = parseHtml(withoutNoise(html));

        if (take === 'each') {
            return root
                .querySelectorAll(selector)
                .map((node) => node.text.replace(/\s+/g, ' ').trim())
                .filter((text) => text !== '');
        }

        const one = root.querySelector(selector);
        const text = one ? one.text.replace(/[ \t ]+/g, ' ').trim() : '';
        return text === '' ? [] : [text];
    } catch {
        return [];
    }
}

/* -------------------------------------------------------------------------- */
/*  Applying a profile                                                        */
/* -------------------------------------------------------------------------- */

/** Whatever a strategy found, as a list of lines. */
function run(strategy: Strategy, html: string, blocks: Block[]): string[] {
    switch (strategy.kind) {
        case 'meta': {
            const value = metaContent(html, strategy.property);
            return value === '' ? [] : [value];
        }
        case 'jsonLd': {
            const value = jsonLdValue(html, strategy.path);
            if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()];
            if (Array.isArray(value)) {
                return value
                    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                    .filter((entry) => entry !== '');
            }
            return [];
        }
        case 'listAfterHeading':
            return listAfterHeading(blocks, strategy.heading);
        case 'textAfterHeading': {
            const text = textAfterHeading(blocks, strategy.heading);
            return text === '' ? [] : [text];
        }
        case 'selector':
            return bySelector(html, strategy.selector, strategy.take);
    }
}

export interface ProfileResult {
    title: string;
    ingredients: string[];
    method: string;
    imageUrl: string;
    /** The fields the profile named but could not find on this page. */
    missing: Array<'title' | 'ingredients' | 'method' | 'image'>;
}

/**
 * Reads a page the way a profile says to.
 *
 * Finding nothing is a normal outcome and is reported in `missing` rather than
 * thrown: a site that has been redesigned should fall back to a model, and the
 * caller decides that by looking at what came back.
 */
export function applyProfile(html: string, profile: SiteProfile): ProfileResult {
    const blocks = readableBlocks(html);
    const missing: ProfileResult['missing'] = [];

    const first = (field: 'title' | 'image', strategy: Strategy | undefined): string => {
        if (!strategy) return '';
        const found = run(strategy, html, blocks);
        if (found.length === 0) missing.push(field);
        return found[0] ?? '';
    };

    const title = first('title', profile.title);
    const imageUrl = first('image', profile.image);

    let ingredients: string[] = [];
    if (profile.ingredients) {
        ingredients = run(profile.ingredients, html, blocks);
        if (ingredients.length === 0) missing.push('ingredients');
    }

    let method = '';
    if (profile.method) {
        const found = run(profile.method, html, blocks);
        // A method strategy that returns many lines returns the steps; joining
        // them is the same shape `textAfterHeading` produces on its own.
        method =
            found.length > 1
                ? found.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
                : found[0] ?? '';
        if (method === '') missing.push('method');
    }

    return { title, ingredients, method, imageUrl, missing };
}

/* -------------------------------------------------------------------------- */
/*  Storing one                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The key a profile is filed under.
 *
 * `www.` is dropped so that a share from a phone and a paste from a browser —
 * which disagree about it more often than not — do not learn the same site
 * twice and then disagree about it for ever.
 */
export function hostOf(url: string): string | null {
    try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        return host === '' ? null : host;
    } catch {
        return null;
    }
}

export interface StoredProfile {
    host: string;
    profile: SiteProfile;
    learnedFrom: string;
    learnedBy: string;
    learnedAt: Date;
    failures: number;
    stale: boolean;
}

/**
 * Where profiles live, as seen from the import.
 *
 * An interface rather than a direct call, for the same reason `AiCapability`
 * is one: `captureProcess` must not import Prisma. A module that does cannot
 * be loaded by the test runner, and the import pipeline is the part of this
 * codebase that most needs to be testable offline.
 *
 * It also means the pipeline can be run with profiles switched off entirely,
 * which is what `NO_PROFILES` is for and what the diagnose script uses to show
 * the difference a profile makes.
 */
export interface SiteProfileStore {
    load(host: string): Promise<StoredProfile | null>;
    save(input: {
        host: string;
        profile: SiteProfile;
        learnedFrom: string;
        learnedBy: string;
    }): Promise<void>;
    /** Records that a profile was used, and whether what it produced held up. */
    recordUse(host: string, ok: boolean, error?: string): Promise<void>;
}

/** A store that remembers nothing. The default, so nothing depends on a table. */
export const NO_PROFILES: SiteProfileStore = {
    load: async () => null,
    save: async () => {},
    recordUse: async () => {},
};

/**
 * How many bad drafts in a row before a profile is set aside.
 *
 * Not one. A site that serves a broken page once, or a recipe page that really
 * is thin, would otherwise throw away a mapping that has worked for months and
 * cost a model call to rebuild. Three consecutive refusals is a site that has
 * changed rather than a site having a bad day.
 */
export const FAILURES_BEFORE_STALE = 3;

/**
 * Reads a stored profile back, refusing anything that no longer validates.
 *
 * A row can outlive the vocabulary it was written in: a strategy removed in a
 * later version leaves rows naming it. Re-validating on the way out means such
 * a row is simply not used, and the next import re-learns the site — rather
 * than a strategy name falling through a `switch` and reading nothing.
 */
export function profileFromStored(value: string): SiteProfile | null {
    let data: unknown;
    try {
        data = JSON.parse(value);
    } catch {
        return null;
    }

    const parsed = profileSchema.safeParse(data);
    if (!parsed.success) return null;

    return isUsefulProfile(parsed.data) ? parsed.data : null;
}
