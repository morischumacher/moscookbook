import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { captureInputFrom } from '../src/lib/captureInput';
import { processCapture } from '../src/lib/captureProcess';
import { isUsable, type RecordedCall, type Transcript } from '../src/lib/transcript';
import type { AiCapability, AiProvider } from '../src/lib/aiImport';

const DIRECTORY = join(__dirname, 'transcripts');

/**
 * Real imports, replayed.
 *
 * A transcript is one import that actually happened, written down by
 * `npm run diagnose -- --record <url>`: the page as the site served it, every
 * request made to a provider, every answer that came back, and what the
 * pipeline produced from all of it.
 *
 * Replayed here with the network replaced, it is the end-to-end test that
 * neither half of the suite could be on its own. The hand-written cases assert
 * that the code handles shapes somebody imagined — which is the class of test
 * that passed a hundred times while every screenshot capture from a real phone
 * was being rejected with "Nothing usable was sent". The fixtures assert
 * invariants over real markup but stop at the rules. This covers the whole
 * chain, against traffic that occurred, for nothing and without a key.
 *
 * ## What it asserts, and why that is the interesting question
 *
 * Not "the draft is correct" — nobody can write that down for a page they have
 * not read, and a test that encodes one site's current recipe is a test that
 * fails when the site edits a paragraph.
 *
 * What it asserts is **that the pipeline still does what it did**: the same
 * status, read by the same means, with a draft of roughly the same size. A
 * change in any of those is either a bug or a decision, and both are worth
 * stopping for. The sizes are compared with a tolerance, because a model
 * replays byte-identically and a *merge* does not have to.
 *
 * ## The one thing a replay cannot check
 *
 * Whether the model would still answer that way. It would not — ask twice, get
 * two answers. So what is replayed is the answer that was given, which makes
 * this a test of *our* code and not of theirs. That is the right boundary:
 * their behaviour is not ours to regress.
 */

interface Replay {
    name: string;
    transcript: Transcript;
    page: string | null;
}

function load(): Replay[] {
    let files: string[];

    try {
        files = readdirSync(DIRECTORY).filter((name) => name.endsWith('.json'));
    } catch {
        return [];
    }

    const replays: Replay[] = [];

    for (const name of files) {
        let transcript: Transcript;

        try {
            transcript = JSON.parse(readFileSync(join(DIRECTORY, name), 'utf8')) as Transcript;
        } catch {
            // A file that is not a transcript is reported as a failure rather
            // than skipped: a corrupt recording is a recording somebody thinks
            // they have.
            replays.push({ name, transcript: null as unknown as Transcript, page: null });
            continue;
        }

        const pagePath = join(DIRECTORY, name.replace(/\.json$/, '.page.html'));
        replays.push({
            name,
            transcript,
            page: existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : null,
        });
    }

    return replays;
}

/**
 * Stands in for the network, answering from the recording.
 *
 * Provider calls are answered **in the order they were recorded**, not matched
 * by request body. Matching by body would be stricter and would be wrong: the
 * whole point is to notice when what we send changes, and a matcher keyed on
 * the request would report a changed request as "no recording" rather than as
 * the difference it is. Order is what a transcript has, and order is what a
 * retry loop preserves.
 */
function replayNetwork(replay: Replay) {
    const original = globalThis.fetch;
    const remaining: RecordedCall[] = [...replay.transcript.calls];
    const sentBodies: unknown[] = [];
    let pageServed = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        const recorded = remaining.length > 0 && url.includes('googleapis')
            ? remaining.shift()
            : remaining.length > 0 && (url.includes('anthropic') || url.includes('openai'))
                ? remaining.shift()
                : null;

        if (recorded) {
            try {
                sentBodies.push(JSON.parse(String(init?.body ?? 'null')));
            } catch {
                sentBodies.push('<not json>');
            }

            const text = JSON.stringify(recorded.responseBody);
            return {
                ok: recorded.status < 400,
                status: recorded.status,
                url,
                headers: new Headers({ 'content-type': 'application/json' }),
                text: async () => text,
                json: async () => recorded.responseBody,
                arrayBuffer: async () => new ArrayBuffer(0),
            } as unknown as Response;
        }

        // Anything else is the page.
        pageServed += 1;
        const html = replay.page ?? '';

        return {
            ok: html !== '',
            status: html === '' ? 404 : 200,
            url: replay.transcript.source,
            headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
            text: async () => html,
            json: async () => ({}),
            arrayBuffer: async () => new TextEncoder().encode(html).buffer,
        } as unknown as Response;
    }) as typeof globalThis.fetch;

    return {
        sentBodies,
        get unusedCalls() {
            return remaining.length;
        },
        get pageServed() {
            return pageServed;
        },
        restore: () => {
            globalThis.fetch = original;
        },
    };
}

/**
 * The capability the recording was made under, reconstructed.
 *
 * The key is a placeholder — the network never reaches a provider on a replay,
 * so the only thing that matters is that there *is* one and that the mode
 * allows what the recording shows was allowed. A recording in which a model
 * was asked is replayed with `always`; one in which none was is replayed with
 * whatever would still not ask.
 */
function capabilityFor(transcript: Transcript): AiCapability {
    const asked = transcript.calls.length > 0;

    if (!asked) return { mode: 'off', keys: [] };

    const provider = (transcript.outcome.provider ?? 'google') as AiProvider;
    return {
        mode: 'always',
        keys: [{ provider, apiKey: 'replayed-no-key-needed', model: null }],
    };
}

/** Sizes drift a little when a merge changes; a third is not a regression. */
function near(actual: number, recorded: number, maxDrift = 0.3): boolean {
    if (recorded === 0) return actual === 0;
    return Math.abs(actual - recorded) / recorded <= maxDrift;
}

export default async function transcriptTests() {
    suite('recorded imports');

    const replays = load();

    if (replays.length === 0) {
        check(
            'no transcripts recorded yet — run npm run diagnose -- --record <url>',
            true,
            'tests/transcripts/ holds only its README'
        );
        return;
    }

    for (const replay of replays) {
        const label = replay.name.replace(/\.json$/, '');

        if (!replay.transcript) {
            check(`${label}: is readable JSON`, false, 'the file could not be parsed');
            continue;
        }

        const broken = isUsable(replay.transcript);
        if (broken) {
            check(`${label}: is a usable recording`, false, broken);
            continue;
        }

        const recorded = replay.transcript.outcome;

        // A recording with no page is one made against a paste or a photo;
        // those are replayed from the calls alone.
        if (replay.transcript.kind === 'url' && !replay.page) {
            check(`${label}: kept the page it was recorded from`, false, 'no .page.html beside it');
            continue;
        }

        const net = replayNetwork(replay);

        try {
            const classified = captureInputFrom({ url: replay.transcript.source });

            if (!classified) {
                check(`${label}: the classifier still accepts this input`, false, replay.transcript.source);
                continue;
            }

            const result = await processCapture(classified, capabilityFor(replay.transcript));

            /* ------------------------------------------------- the outcome */

            equal(`${label}: same status`, result.status, recorded.status);
            equal(`${label}: read the same way`, result.readBy, recorded.readBy);
            equal(`${label}: same provider`, result.provider, recorded.provider);

            equal(`${label}: same title`, result.draft?.title ?? '', recorded.title);

            check(
                `${label}: about the same number of ingredients`,
                near(result.draft?.ingredients.length ?? 0, recorded.ingredientCount),
                `${result.draft?.ingredients.length ?? 0} vs ${recorded.ingredientCount}`
            );

            check(
                `${label}: about the same amount of method`,
                near(result.draft?.instructions.length ?? 0, recorded.instructionLength),
                `${result.draft?.instructions.length ?? 0} vs ${recorded.instructionLength}`
            );

            /* --------------------------------------------- what we sent out */

            equal(
                `${label}: asked the model the same number of times`,
                net.sentBodies.length,
                replay.transcript.calls.length
            );

            equal(`${label}: used every recorded answer`, net.unusedCalls, 0);

            // The request bodies are the "input transfer" this was built to
            // check: not that a model answered, but that what we handed it is
            // still what we handed it.
            for (let index = 0; index < net.sentBodies.length; index += 1) {
                const sent = net.sentBodies[index] as Record<string, unknown>;
                const before = replay.transcript.calls[index].requestBody as Record<string, unknown>;

                check(
                    `${label}: request ${index + 1} still carries a prompt`,
                    JSON.stringify(sent).length > 100,
                    JSON.stringify(sent).slice(0, 120)
                );

                equal(
                    `${label}: request ${index + 1} names the same model`,
                    sent?.model ?? null,
                    before?.model ?? null
                );

                check(
                    `${label}: request ${index + 1} is roughly the same size`,
                    near(JSON.stringify(sent).length, JSON.stringify(before).length),
                    `${JSON.stringify(sent).length} vs ${JSON.stringify(before).length}`
                );
            }

            /* ------------------------------------ things that are never ok */

            const draft = result.draft;

            if (draft) {
                check(
                    `${label}: the title is not the address`,
                    !draft.title.startsWith('http'),
                    draft.title
                );

                check(
                    `${label}: no ingredient is a whole paragraph`,
                    draft.ingredients.every((line) => line.item.length < 120),
                    draft.ingredients.find((line) => line.item.length >= 120)?.item
                );

                check(
                    `${label}: no cookie banner survived into the method`,
                    !/cookie|einwilligung|consent|abonnier|subscribe/i.test(
                        draft.instructions.slice(0, 400)
                    ),
                    draft.instructions.slice(0, 120)
                );

                check(
                    `${label}: the source link is kept`,
                    draft.sourceUrl === replay.transcript.source,
                    draft.sourceUrl
                );
            }
        } finally {
            net.restore();
        }
    }
}
