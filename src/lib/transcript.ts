/**
 * A recorded import, replayable offline.
 *
 * The problem this solves is specific and was blocking real work. The import
 * has two halves that cannot be tested the same way: the *rules*, which are
 * pure functions over markup and can be driven by a fixture, and the *model*,
 * which is a paid network call to a company whose answers change between
 * asking twice. Hand-written cases cover neither honestly — they assert that
 * the code handles the shapes somebody imagined, which is exactly the class of
 * test that passed a hundred times while every screenshot capture on a real
 * phone was being rejected.
 *
 * A transcript is one real import, written down: the page as it was served,
 * every request made to a provider, and every answer that came back. Replayed,
 * it is a deterministic end-to-end test of the whole pipeline — rules,
 * scoring, the decision to ask, the merge — with no key, no network and no
 * cost, against traffic that actually happened.
 *
 * **Nothing secret is recorded.** Headers are never captured at all, which is
 * where the API key lives; the recorder stores the URL, the request body and
 * the response body, and the key appears in none of the three. Gemini takes
 * its key in a header, Anthropic in a header, OpenAI in a header. A provider
 * that put one in a body would be caught by `scrubTranscript` below, which
 * runs over everything before it is written.
 *
 * The page is slimmed on the way in — scripts and styles removed, except the
 * two kinds the importer reads — because a modern recipe page is four hundred
 * kilobytes of which perhaps thirty are the recipe, and a test fixture nobody
 * can open in an editor is a test fixture nobody will ever check.
 */

export interface RecordedCall {
    /** The address, with any query string kept: no key travels in one here. */
    url: string;
    method: string;
    /** Parsed when it was JSON, so a diff of two transcripts is readable. */
    requestBody: unknown;
    status: number;
    responseBody: unknown;
    /** Milliseconds. Informational; never asserted on. */
    ms: number;
}

export interface Transcript {
    version: 1;
    recordedAt: string;
    /** What was imported. */
    source: string;
    /** `url` for a page, `text` for a paste, `image` for a photograph. */
    kind: 'url' | 'text' | 'image';
    /** The provider calls, in the order they were made. */
    calls: RecordedCall[];
    /**
     * What the pipeline produced, recorded so that a replay can assert it
     * rather than merely not crashing.
     */
    outcome: {
        status: string;
        readBy: string;
        provider: string | null;
        error: string | null;
        title: string;
        ingredientCount: number;
        instructionLength: number;
        /** The scoring's verdict on the rules-only draft, before any model. */
        rulesQuality: string;
        rulesProblems: string[];
    };
}

/** The three endpoints a recording cares about. Everything else is the page. */
export const PROVIDER_HOSTS = [
    'api.anthropic.com',
    'api.openai.com',
    'generativelanguage.googleapis.com',
];

export function isProviderCall(url: string): boolean {
    return PROVIDER_HOSTS.some((host) => url.includes(host));
}

/**
 * Removes everything the importer never reads, and nothing it does.
 *
 * Kept: JSON-LD blocks, the YouTube player's `videoDetails`, every meta tag,
 * the title, and the whole body text — because `readableText` is handed the
 * body and a transcript that dropped it would be testing a different input
 * from the one that was recorded.
 *
 * Dropped: every other script, every style block, every comment. That is the
 * four hundred kilobytes.
 */
export function slimPage(html: string): string {
    let slim = html;

    // Scripts, except the two that carry data.
    slim = slim.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
        if (/type\s*=\s*["']application\/ld\+json["']/i.test(block)) return block;
        if (block.includes('"videoDetails"')) {
            // Only the object, not the megabyte of player configuration it
            // sits inside.
            const at = block.indexOf('"videoDetails"');
            return `<script>var ytInitialPlayerResponse = {${block.slice(at, at + 6000)}};</script>`;
        }
        return '';
    });

    slim = slim.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    slim = slim.replace(/<!--[\s\S]*?-->/g, '');
    // Long runs of whitespace left behind by the removals.
    slim = slim.replace(/\n{3,}/g, '\n\n');

    return slim;
}

/**
 * Removes anything that looks like a credential from a transcript.
 *
 * A belt to the brace of never recording headers. The keys are passed in by
 * the recorder, which knows them; each is replaced wherever it appears in the
 * serialised transcript, including inside an error message a provider echoed
 * back.
 */
export function scrubTranscript(json: string, secrets: string[]): string {
    let clean = json;

    for (const secret of secrets) {
        if (!secret || secret.length < 8) continue;
        clean = clean.split(secret).join('«key»');
        clean = clean.split(secret.slice(0, 12)).join('«key»');
        clean = clean.split(secret.slice(-8)).join('«key»');
    }

    // Anything shaped like a key that the caller did not know about.
    clean = clean.replace(/\bsk-ant-[A-Za-z0-9_-]{8,}/g, '«key»');
    clean = clean.replace(/\bsk-[A-Za-z0-9_-]{20,}/g, '«key»');
    clean = clean.replace(/\bAIza[A-Za-z0-9_-]{20,}/g, '«key»');

    return clean;
}

/**
 * A transcript is only worth keeping if it can be replayed.
 *
 * Checked at write time rather than at read time: a recording that is missing
 * a field should fail on the machine that made it, while somebody is still
 * looking at the screen, not months later in somebody else's test run.
 */
export function isUsable(transcript: Transcript): string | null {
    if (transcript.version !== 1) return 'unknown transcript version';
    if (!transcript.source) return 'no source';
    if (!transcript.outcome) return 'no outcome recorded';
    if (typeof transcript.outcome.status !== 'string') return 'no status';

    for (const call of transcript.calls) {
        if (!call.url) return 'a call with no url';
        if (typeof call.status !== 'number') return 'a call with no status';
    }

    return null;
}
