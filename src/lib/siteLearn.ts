/**
 * Learning where a site keeps its recipes, and refusing to believe the answer.
 *
 * ## The shape of it
 *
 * A model has just read a page and returned a recipe. It is then shown the
 * same page as a numbered list of headings, list items and paragraphs, and
 * asked a narrower question: *which of the strategies we already implement
 * locates each of those fields?* The answer is a profile — four strategy
 * names with their parameters, and nothing else, because that is all the
 * schema permits.
 *
 * ## Why the answer is not trusted
 *
 * Because a model asked "where did you find the ingredients" will always
 * answer, and an answer that sounds right is indistinguishable from one that
 * is right until it is run. A profile is stored once and then used on pages
 * nobody looks at; a plausible-but-wrong one produces a well-formed, wrong
 * recipe on every later import, which is the one failure the rest of this
 * codebase cannot detect.
 *
 * So the profile is applied to the very page it was learned from, and what it
 * produces is compared with what the model itself extracted from that page. If
 * it cannot reproduce that answer, it is thrown away and the import proceeds
 * with the model's result as usual — one wasted call, no lasting damage.
 *
 * Every stored profile has therefore worked at least once, on real markup.
 * That is a weak guarantee and it is stated weakly on purpose: it says the
 * profile worked on *one* page of that site. Whether it generalises is decided
 * later, by the scoring, on every page it is used for.
 *
 * ## No database in here
 *
 * Deliberate, and the same rule `captureProcess` follows: this module takes
 * keys and returns a profile. Storing it is the caller's job. It keeps the
 * test runner able to import it, and it keeps the decision about what to
 * persist in one place instead of two.
 */

import { completeWithKey, type AiExtractionResult, type AiKey } from './aiImport';
import { readableBlocks } from './readableText';
import {
    applyProfile,
    isUsefulProfile,
    profileSchema,
    type ProfileResult,
    type SiteProfile,
} from './siteProfile';

/* -------------------------------------------------------------------------- */
/*  Asking                                                                    */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You are mapping how one website lays out its recipes, so the
site can be read later without a model.

You are given a page as a numbered list of blocks, and the recipe that was
already extracted from it. Say WHERE each field is, by choosing one strategy per
field from the list below. Do not invent strategies and do not write code.

Strategies, in order of preference:

1. {"kind":"listAfterHeading","heading":"<exact heading text>"}
   The list items that follow that heading, up to the next heading.
   Prefer this for ingredients.

2. {"kind":"textAfterHeading","heading":"<exact heading text>"}
   Everything after that heading, up to the next heading of the same rank.
   Prefer this for the method.

3. {"kind":"meta","property":"og:title"}
   A meta tag. Good for the title and the image; the properties that exist are
   listed under META at the end of the page.

4. {"kind":"jsonLd","path":"a.b.0.c"}
   A dotted path into one of the page's JSON-LD documents. Only when the page
   has structured data that the strict parser refused.

5. {"kind":"selector","selector":"<css>","take":"each"|"text"}
   A LAST RESORT, only when the page has no usable headings. "each" returns one
   line per match, "text" returns a single block. Avoid selectors that depend on
   generated class names or positions like :nth-child — they break the next time
   the site is restyled.

Rules:
- Headings must be copied EXACTLY as they appear in the block list.
- Choose the heading that sits directly above the recipe content, never one
  above a list of other recipes, related posts, comments or a newsletter box.
- Omit a field entirely rather than guessing at it.

Return ONLY a JSON object, no prose and no code fences:
{"title": <strategy>|null, "ingredients": <strategy>|null,
 "method": <strategy>|null, "image": <strategy>|null}`;

/** How much of the page is shown. Blocks, not characters, so a list survives. */
const MAX_BLOCKS_SHOWN = 400;
const MAX_BLOCK_TEXT = 300;

/** The meta tags worth offering; the model may not go looking for others. */
const META_OFFERED = ['og:title', 'og:image', 'og:description', 'description', 'og:site_name'];

function metaSummary(html: string): string {
    const found: string[] = [];

    for (const property of META_OFFERED) {
        const pattern = new RegExp(
            `<meta[^>]+(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
            'i'
        );
        if (pattern.test(html)) found.push(property);
    }

    return found.length === 0 ? 'META: none' : `META: ${found.join(', ')}`;
}

/** The page as the profile sees it, which is the only view worth asking about. */
export function blockListing(html: string): string {
    const blocks = readableBlocks(html).slice(0, MAX_BLOCKS_SHOWN);

    const lines = blocks.map((block, index) => {
        const label =
            block.kind === 'heading' ? `H${block.level}` : block.kind === 'item' ? 'ITEM' : 'TEXT';
        const text =
            block.text.length > MAX_BLOCK_TEXT
                ? `${block.text.slice(0, MAX_BLOCK_TEXT)}…`
                : block.text;
        return `${String(index).padStart(3, ' ')} ${label.padEnd(4)} ${text}`;
    });

    return lines.join('\n');
}

function recipeSummary(recipe: AiExtractionResult): string {
    const ingredients = recipe.ingredients
        .slice(0, 40)
        .map((line) => `${line.amount} ${line.item}`.trim())
        .join('\n');

    return [
        `TITLE: ${recipe.title}`,
        `INGREDIENTS:\n${ingredients}`,
        `METHOD (first 600 chars):\n${recipe.instructions.slice(0, 600)}`,
    ].join('\n\n');
}

/** Pulls the JSON object out of an answer that may be wrapped in prose. */
function jsonFrom(answer: string): unknown {
    const trimmed = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

    try {
        return JSON.parse(trimmed);
    } catch {
        const opened = trimmed.indexOf('{');
        const closed = trimmed.lastIndexOf('}');
        if (opened === -1 || closed <= opened) return null;
        try {
            return JSON.parse(trimmed.slice(opened, closed + 1));
        } catch {
            return null;
        }
    }
}

/**
 * A profile as the model proposed it, with anything it invented dropped.
 *
 * Per field rather than all-or-nothing: a model that names three good
 * strategies and one nonsensical one has still learned three quarters of the
 * site, and discarding all of it over the fourth would mean paying for the
 * whole call again on the next import.
 */
export function profileFrom(answer: string): SiteProfile | null {
    const data = jsonFrom(answer);
    if (!data || typeof data !== 'object') return null;

    const record = data as Record<string, unknown>;
    const profile: SiteProfile = {};

    for (const field of ['title', 'ingredients', 'method', 'image'] as const) {
        const value = record[field];
        if (value === null || value === undefined) continue;

        const parsed = profileSchema.shape[field].safeParse(value);
        if (parsed.success && parsed.data) profile[field] = parsed.data;
    }

    return Object.keys(profile).length === 0 ? null : profile;
}

/* -------------------------------------------------------------------------- */
/*  Disbelieving                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How much of the model's answer the profile has to reproduce.
 *
 * Not all of it, because the two are not the same kind of thing: the model
 * tidies as it reads — it drops "for serving", merges a split line, rewrites
 * "2 c. buttermilk" as "2 cups buttermilk" — while a profile returns the page
 * verbatim. Demanding identity would reject every correct profile.
 *
 * Seven in ten ingredients and six in ten of the method's words is the band
 * where the profile is demonstrably reading the same part of the page. Below
 * it, it is reading something else.
 */
const INGREDIENTS_FOUND = 0.7;
const METHOD_FOUND = 0.6;

/**
 * And a ceiling, which matters more than the floor.
 *
 * A profile that returns the ingredients *and* the related-recipes rail
 * contains all of the model's answer and so passes any overlap test perfectly.
 * The failure that worries me is precisely this one — extra content that reads
 * as food — so the profile may not return more than twice what the model saw.
 */
const INGREDIENTS_CEILING = 2;

function words(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .filter((word) => word.length >= 4)
    );
}

function fraction(wanted: Set<string>, have: Set<string>): number {
    if (wanted.size === 0) return 1;
    let found = 0;
    for (const word of wanted) if (have.has(word)) found += 1;
    return found / wanted.size;
}

/** Whether one ingredient line is recognisably present in the profile's list. */
function lineFound(wanted: string, lines: string[]): boolean {
    const want = words(wanted);
    if (want.size === 0) return true;
    return lines.some((line) => fraction(want, words(line)) >= 0.5);
}

export interface Verification {
    ok: boolean;
    /** Why not, in words, for the diagnose script and the logs. */
    reason: string | null;
    ingredientsFound: number;
    methodFound: number;
}

export function verifyProfile(read: ProfileResult, recipe: AiExtractionResult): Verification {
    const wantedLines = recipe.ingredients
        .map((line) => `${line.amount} ${line.item}`.trim())
        .filter((line) => line !== '');

    const foundLines = wantedLines.filter((line) => lineFound(line, read.ingredients)).length;
    const ingredientsFound = wantedLines.length === 0 ? 0 : foundLines / wantedLines.length;
    const methodFound = fraction(words(recipe.instructions), words(read.method));

    const report = (reason: string | null): Verification => ({
        ok: reason === null,
        reason,
        ingredientsFound,
        methodFound,
    });

    if (wantedLines.length === 0 || recipe.instructions.trim() === '') {
        return report('the model found no recipe to check the profile against');
    }

    /*
     * Only the two fields that carry the recipe.
     *
     * This used to reject a profile for any miss at all, including the image,
     * which is both too strict and hides a bug: a page with no `og:image`
     * would throw away a perfectly good mapping of its ingredients and method
     * over a picture. A title or image strategy that misses is dropped from
     * the profile by the caller instead — the field is simply not learned.
     */
    const lost = read.missing.filter((field) => field === 'ingredients' || field === 'method');
    if (lost.length > 0) {
        return report(`the profile could not find: ${lost.join(', ')}`);
    }
    if (ingredientsFound < INGREDIENTS_FOUND) {
        return report(
            `the profile found ${Math.round(ingredientsFound * 100)}% of the ingredients the model did`
        );
    }
    if (read.ingredients.length > wantedLines.length * INGREDIENTS_CEILING) {
        return report(
            `the profile returned ${read.ingredients.length} ingredient lines where the model saw ${wantedLines.length}`
        );
    }
    if (methodFound < METHOD_FOUND) {
        return report(
            `the profile's method shares ${Math.round(methodFound * 100)}% of its words with the model's`
        );
    }

    return report(null);
}

/* -------------------------------------------------------------------------- */
/*  The whole step                                                            */
/* -------------------------------------------------------------------------- */

export interface LearnResult {
    profile: SiteProfile | null;
    /** What happened, for the diagnose script. Always set. */
    note: string;
    verification: Verification | null;
}

/**
 * Learns a profile for a page, or explains why it did not.
 *
 * `key` is passed separately from the import's own key so the learning step
 * may use a better model than the everyday one. A profile is written once and
 * read a hundred times, so a mistake here is multiplied in a way a mistake in
 * a single import is not — which is the argument for spending more on it, and
 * the reason the choice exists at all.
 */
export type AskTheModel = (key: AiKey, system: string, user: string) => Promise<string>;

/** The real one. A test passes its own, the same way `aiPolish` is tested. */
const askProvider: AskTheModel = (key, system, text) =>
    completeWithKey(key, { kind: 'raw', system, text });

export async function learnSiteProfile(
    html: string,
    recipe: AiExtractionResult,
    key: AiKey,
    call: AskTheModel = askProvider
): Promise<LearnResult> {
    const listing = blockListing(html);
    if (listing.trim() === '') {
        return { profile: null, note: 'the page had no readable structure to describe', verification: null };
    }

    let answer: string;
    try {
        answer = await call(
            key,
            SYSTEM_PROMPT,
            `PAGE:\n${listing}\n\n${metaSummary(html)}\n\nEXTRACTED RECIPE:\n${recipeSummary(recipe)}`
        );
    } catch (error) {
        return {
            profile: null,
            note: `the model could not be asked: ${error instanceof Error ? error.message : 'unknown'}`,
            verification: null,
        };
    }

    const proposed = profileFrom(answer);
    if (!proposed) {
        return { profile: null, note: 'the model did not answer with a usable profile', verification: null };
    }
    if (!isUsefulProfile(proposed)) {
        return {
            profile: null,
            note: 'the proposed profile located no ingredients or no method',
            verification: null,
        };
    }

    /*
     * A title or image strategy that does not work on the page it was proposed
     * for is not learned. Keeping it would mean every later import from this
     * site ran a strategy already known to find nothing.
     */
    const trial = applyProfile(html, proposed);
    const kept: SiteProfile = { ...proposed };
    if (trial.missing.includes('title')) delete kept.title;
    if (trial.missing.includes('image')) delete kept.image;

    const verification = verifyProfile(trial, recipe);
    if (!verification.ok) {
        return { profile: null, note: `rejected — ${verification.reason}`, verification };
    }

    return { profile: kept, note: 'learned and verified against this page', verification };
}
