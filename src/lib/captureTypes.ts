/**
 * The shapes the capture pipeline speaks, with no code in them.
 *
 * A leaf module, so that captureProcess, captureAi and captureDraft can all
 * name the same result type without any of them importing the others. Type
 * imports never create a runtime cycle, but a file that is only types makes
 * the direction of dependency readable: everything points at this, this
 * points at nothing but other types.
 */

import type { CaptureStatus } from './capture';
import type { ImportedRecipe } from './recipeFromHtml';
import type { AiKey, ModelReport } from './aiImport';
import type { SiteProfileStore } from './siteProfile';
import type { AccountSiteStore } from './authorSite';

export interface ProcessedCapture {
    status: Extract<CaptureStatus, 'ready' | 'needsWork' | 'failed'>;
    draft: ImportedRecipe | null;
    /** Shown in the inbox. A reason, not a stack trace. */
    error: string | null;
    /**
     * How this draft came to exist, in the inbox's own words.
     *
     * Not bookkeeping. A draft produced by rules is a transcription of what a
     * page said; a draft produced by a model is a *reading* of what a page
     * said, and the second one can be confidently wrong in ways the first
     * cannot. Somebody deciding how carefully to check a draft before
     * publishing it is entitled to know which they are looking at, and until
     * now the two were indistinguishable once they reached the inbox.
     *
     *   rules            — no model was asked. Structured data, or a clean parse.
     *   rules+ai         — the rules found part of it, a model filled the gaps.
     *   rules+ai-failed  — a model was asked and did not answer.
     *   ai               — a model produced it. A photograph, always.
     *
     * The third one exists because of a question that had no good answer: "the
     * setting says ask when the rules fall short — what happens when the model
     * is then also down?" The behaviour was already right (the rules' draft is
     * kept, nothing fails, nothing is lost). What was wrong is that it was
     * *invisible*: the capture came back labelled "rules", exactly as if the
     * model had never been needed. So a key with no credit left, a wrong model
     * name, a provider having an afternoon — all of it looked like the cookbook
     * working normally, and the way you would find out is by wondering, weeks
     * later, why the AI never seemed to do anything.
     */
    readBy:
        | 'rules'
        | 'rules+ai'
        | 'rules+ai-failed'
        | 'ai'
        /**
         * Read from what was learned about this site, with no model involved.
         *
         * The label matters as much as the others do: a profile is the one
         * path where the cookbook is following an instruction a model wrote
         * weeks ago, on a page nobody has looked at since. If a site starts
         * importing badly, the first question is whether its profile is being
         * used, and that question needs an answer in the row rather than a
         * reconstruction from timestamps.
         */
        | 'profile'
        /** The profile fell short on this page and a model finished the job. */
        | 'profile+ai';
    /** Which provider answered, when one did. */
    provider: string | null;
}

/**
 * How this run is allowed to behave, beyond what the capability says.
 *
 * `force` is somebody pressing "read this with the AI" on a draft the scoring
 * called good. That is a different act from an automatic import and it obeys a
 * different rule: the quality gate is skipped entirely, and the mode gate
 * loosens from `assistsText` to `canUseAi` — so "nur Bilder" does not refuse a
 * button somebody deliberately pressed, while "nie" still means never.
 *
 * The scoring is a guess about whether asking would help. A person looking at
 * the draft has better information than the scoring does, and the scoring
 * exists to save them the trouble, not to overrule them.
 */
export interface ProcessOptions {
    force?: boolean;
    /**
     * Where what we know about sites is kept.
     *
     * Passed in rather than imported, for the reason at the top of this file:
     * nothing here may reach Prisma. The default remembers nothing, so every
     * existing caller and every test behaves exactly as it did.
     */
    profiles?: SiteProfileStore;
    /** Which website an account keeps its recipes on. See authorSite.ts. */
    accounts?: AccountSiteStore;
    /**
     * The key the *learning* step may use, which need not be the key the
     * import uses.
     *
     * A profile is written once and followed a hundred times, so a mistake
     * here is multiplied in a way a mistake in one import is not. Left unset,
     * nothing is learned — learning is never a side effect of an import
     * somebody did not ask to be expensive.
     */
    learnWith?: AiKey;
    /**
     * Told which model answered, so a caller with a database can write it
     * down. See `rememberModel`: the fallback walks a list when the first
     * choice is busy or out of quota, and the one that worked is worth keeping
     * rather than rediscovering on every share.
     */
    onModel?: ModelReport;
    /** Told about the calls the *learning* step makes, which are not the import's. */
    onLearn?: ModelReport;
}

export interface ProcessableCapture {
    kind: string;
    source: string;
    sourceUrl: string | null;
    rawText: string | null;
    /** Only set once a photograph has been uploaded. */
    imageUrl?: string | null;
    /** Further screenshots of the same share, read together with the first. */
    moreImageUrls?: string[];
}

export interface AiTrace {
    provider: string | null;
    asked: boolean;
    failed: boolean;
    /**
     * Not asked because there was nothing worth asking about.
     *
     * Different from "not asked because the AI is off", and the difference is
     * the sentence the inbox prints. An Instagram reel whose whole caption is
     * "Recipe up now in my newsletter" gives fifty-seven characters once the
     * platform's wrapper comes off — under the floor, so no model is asked,
     * and the right thing to say is that there was no recipe rather than that
     * the page held part of one.
     */
    tooThin?: boolean;
}

