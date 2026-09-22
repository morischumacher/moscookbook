#!/usr/bin/env ts-node
/**
 * One import, traced end to end, against the real thing.
 *
 *   npm run diagnose -- https://www.chefkoch.de/rezepte/…
 *   npm run diagnose -- --record https://www.chefkoch.de/rezepte/…
 *   npm run diagnose -- --inbox            (every open capture)
 *   npm run diagnose -- --inbox 42         (one of them, by id)
 *
 * This exists because of a gap that cannot be closed from a test file. The
 * import is a chain — fetch, rules, score, decide, ask, merge — and when the
 * result is disappointing, every link looks the same from the outside: a draft
 * in the inbox with something missing. Was the page unreadable? Did the rules
 * get it and the scoring call it good? Was the model asked and did it refuse?
 * Did it answer and get merged into nothing?
 *
 * So each link prints what it did. Run it against a page that disappointed you
 * and the answer is on the screen rather than inferred.
 *
 * With `--record` it also writes the whole thing to `tests/transcripts/` — the
 * page as served, every provider call, every answer — and that file replays as
 * a deterministic end-to-end test with no key and no network. A real import
 * that went wrong becomes a test that stays wrong until it is fixed, which is
 * the only kind of regression test worth having for a pipeline whose inputs
 * belong to other people.
 *
 * It runs against the configured providers and **costs whatever one import
 * costs** — a fraction of a cent, and not zero. It says so before it asks.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { extractRecipeFromHtml } from '../src/lib/recipeFromHtml';
import { fetchPage } from '../src/lib/fetchPage';
import { readableText } from '../src/lib/readableText';
import { assessDraft } from '../src/lib/draftQuality';
import { captureInputFrom } from '../src/lib/captureInput';
import { processCapture } from '../src/lib/captureProcess';
import prisma from '../src/lib/prisma';
import { aiCapability } from '../src/lib/aiConfig';
import { canUseAi, assistsText, PROVIDER_LABEL, type AiCapability } from '../src/lib/aiImport';
import {
    isProviderCall,
    scrubTranscript,
    slimPage,
    type RecordedCall,
    type Transcript,
} from '../src/lib/transcript';

const OUT = 'tests/transcripts';

const bold = (text: string) => `\u001b[1m${text}\u001b[0m`;
const dim = (text: string) => `\u001b[2m${text}\u001b[0m`;
const green = (text: string) => `\u001b[32m${text}\u001b[0m`;
const red = (text: string) => `\u001b[31m${text}\u001b[0m`;
const yellow = (text: string) => `\u001b[33m${text}\u001b[0m`;

function step(number: number, title: string): void {
    console.log(`\n${bold(`${number}. ${title}`)}`);
}

function line(label: string, value: unknown): void {
    console.log(`   ${label.padEnd(22)} ${String(value)}`);
}

/**
 * Wraps fetch so the run can be written down.
 *
 * Headers are deliberately not captured — that is where every provider puts
 * its key, and a recorder that never sees one cannot leak one. The page's own
 * body is slimmed on the way past, for the reason in lib/transcript.ts.
 */
function record() {
    const original = globalThis.fetch;
    const calls: RecordedCall[] = [];
    let page: { url: string; status: number; html: string } | null = null;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const started = performance.now();
        const response = await original(input as RequestInfo, init);
        const ms = Math.round(performance.now() - started);

        const clone = response.clone();

        if (isProviderCall(url)) {
            let requestBody: unknown = null;
            try {
                requestBody = JSON.parse(String(init?.body ?? 'null'));
            } catch {
                requestBody = '<not json>';
            }

            let responseBody: unknown = null;
            try {
                responseBody = await clone.json();
            } catch {
                responseBody = await clone.text().catch(() => '<unreadable>');
            }

            calls.push({
                url,
                method: init?.method ?? 'GET',
                requestBody,
                status: response.status,
                responseBody,
                ms,
            });

            console.log(
                dim(`      → ${new URL(url).hostname} ${response.status} (${ms} ms)`)
            );
        } else if (!page) {
            page = {
                url: response.url || url,
                status: response.status,
                html: slimPage(await clone.text().catch(() => '')),
            };
        }

        return response;
    }) as typeof globalThis.fetch;

    return {
        calls,
        get page() {
            return page;
        },
        restore: () => {
            globalThis.fetch = original;
        },
    };
}

function describeCapability(ai: AiCapability): void {
    line('mode', ai.mode);
    line('keys', ai.keys.length === 0 ? red('none') : ai.keys.map((k) => PROVIDER_LABEL[k.provider]).join(' → '));

    for (const key of ai.keys) {
        line(`  ${PROVIDER_LABEL[key.provider]}`, key.model ?? dim('(default model)'));
    }

    line('asks about pictures', canUseAi(ai) ? green('yes') : red('no'));
    line('asks about text', assistsText(ai) ? green('yes') : yellow('no'));
}

async function diagnose(url: string, keep: boolean): Promise<void> {
    console.log(`\n${'─'.repeat(72)}\n${bold(url)}`);

    const ai = await aiCapability();

    step(1, 'What the AI is allowed to do');
    describeCapability(ai);

    if (!canUseAi(ai)) {
        console.log(
            yellow(
                '\n   No usable key. Everything below is the rule-based path, which is\n' +
                '   exactly what a deployment with no AI does — worth seeing on its own.'
            )
        );
    }

    /* ------------------------------------------------------------- the page */

    step(2, 'Fetching the page');
    const started = performance.now();
    const page = await fetchPage(url);
    line('took', `${Math.round(performance.now() - started)} ms`);

    if (!page.ok) {
        console.log(red(`   Could not be read: ${page.failure}`));
        return;
    }

    line('final url', page.finalUrl);
    line('size', `${(page.html.length / 1024).toFixed(0)} KB`);
    line('has JSON-LD', /application\/ld\+json/i.test(page.html) ? green('yes') : red('no'));
    line('readable text', `${readableText(page.html).length} chars after stripping`);

    /* ------------------------------------------------------- the rules alone */

    step(3, 'What the rules got, with no model involved');
    const rules = extractRecipeFromHtml(page.html, page.finalUrl);

    line('title', JSON.stringify(rules.title));
    line('ingredients', rules.ingredients.length);
    for (const ingredient of rules.ingredients.slice(0, 12)) {
        console.log(dim(`      ${(ingredient.amount || '—').padEnd(12)} ${ingredient.item}`));
    }
    if (rules.ingredients.length > 12) {
        console.log(dim(`      … and ${rules.ingredients.length - 12} more`));
    }
    line('method', `${rules.instructions.length} chars`);
    line('image', rules.imageUrl ? green('yes') : red('no'));
    line('servings / times', `${rules.servings ?? '—'} / ${rules.prepMinutes ?? '—'} + ${rules.cookMinutes ?? '—'}`);

    /* ---------------------------------------------------------- the scoring */

    step(4, 'What the scoring makes of that');
    const report = assessDraft(rules);

    const colour = report.quality === 'good' ? green : report.quality === 'thin' ? yellow : red;
    line('verdict', colour(report.quality));
    line('damage points', report.score);

    if (report.problems.length === 0) {
        console.log(dim('      nothing flagged'));
    } else {
        for (const problem of report.problems) console.log(dim(`      • ${problem}`));
    }

    const wouldAsk = report.quality !== 'good' && assistsText(ai);
    line('would ask a model', wouldAsk ? green('yes') : dim('no'));

    /* ------------------------------------------------- the whole thing, live */

    step(5, 'The whole pipeline, as a share from a phone would run it');

    const tape = record();
    let transcript: Transcript | null = null;

    try {
        const classified = captureInputFrom({ url });
        if (!classified) {
            console.log(red('   The capture classifier refused this input.'));
            return;
        }

        line('classified as', `${classified.kind} / ${classified.source}`);

        const result = await processCapture(classified, ai);

        line('status', result.status === 'ready' ? green(result.status) : yellow(result.status));
        line('read by', result.readBy === 'rules' ? result.readBy : green(result.readBy));
        line('provider', result.provider ?? dim('—'));
        line('error', result.error ?? dim('—'));
        line('final title', JSON.stringify(result.draft?.title ?? ''));
        line('final ingredients', result.draft?.ingredients.length ?? 0);
        line('final method', `${result.draft?.instructions.length ?? 0} chars`);

        if (tape.calls.length > 0) {
            step(6, 'What was actually sent to the model');
            for (const call of tape.calls) {
                console.log(`   ${new URL(call.url).hostname}  ${call.status}  ${call.ms} ms`);

                const body = call.requestBody as Record<string, unknown>;
                const sent = JSON.stringify(body).length;
                console.log(dim(`      request: ${sent} bytes, model ${String(body?.model ?? new URL(call.url).pathname)}`));

                if (call.status >= 400) {
                    console.log(red(`      ${JSON.stringify(call.responseBody).slice(0, 300)}`));
                }
            }
        } else {
            step(6, 'What was actually sent to the model');
            console.log(dim('   Nothing. No provider was called.'));
        }

        transcript = {
            version: 1,
            recordedAt: new Date().toISOString(),
            source: url,
            kind: 'url',
            calls: tape.calls,
            outcome: {
                status: result.status,
                readBy: result.readBy,
                provider: result.provider,
                error: result.error,
                title: result.draft?.title ?? '',
                ingredientCount: result.draft?.ingredients.length ?? 0,
                instructionLength: result.draft?.instructions.length ?? 0,
                rulesQuality: report.quality,
                rulesProblems: report.problems,
            },
        };
    } finally {
        tape.restore();
    }

    /* -------------------------------------------------------------- keeping */

    if (!keep || !transcript) return;

    await mkdir(OUT, { recursive: true });

    const slug = url
        .replace(/^https?:\/\//, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/-+/g, '-')
        .slice(0, 70)
        .toLowerCase();

    const secrets = ai.keys.map((key) => key.apiKey);
    const body = scrubTranscript(JSON.stringify(transcript, null, 2), secrets);

    // The page goes next to the transcript rather than inside it: a JSON file
    // with 40 KB of escaped HTML on one line is a file nobody can read, and
    // being readable in a diff is most of why this is worth keeping at all.
    if (tape.page) {
        await writeFile(`${OUT}/${slug}.page.html`, scrubTranscript(tape.page.html, secrets));
    }
    await writeFile(`${OUT}/${slug}.json`, body + '\n');

    console.log(green(`\n   Recorded to ${OUT}/${slug}.json`));
    console.log(dim('   It replays offline on the next npm test.'));
}

/**
 * The captures already sitting in the inbox.
 *
 * The most useful thing to point this at, and the least obvious: those are the
 * imports that actually disappointed somebody. A URL typed on the command line
 * is a guess about what might go wrong; a row in the inbox is a case that did.
 *
 * Only the ones with a link, because a photograph cannot be re-run from here —
 * its bytes are in the blob store and re-reading it would be a second paid
 * call to no purpose. The inbox's own "retry" covers that.
 */
async function fromInbox(id: number | null): Promise<string[]> {
    const rows: { id: number; sourceUrl: string | null; status: string }[] =
        await prisma.capture.findMany({
            where: {
                ...(id === null ? { status: { not: 'published' } } : { id }),
                sourceUrl: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 25,
            select: { id: true, sourceUrl: true, status: true },
        });

    if (rows.length === 0) {
        console.error('No captures with a link found.');
        return [];
    }

    console.log(dim(`${rows.length} capture(s) from the inbox:`));
    for (const row of rows) {
        console.log(dim(`   #${row.id}  ${row.status.padEnd(10)} ${row.sourceUrl}`));
    }

    return rows.map((row) => row.sourceUrl as string);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const keep = args.includes('--record');

    let urls = args.filter((argument) => argument.startsWith('http'));

    if (args.includes('--inbox')) {
        const after = args[args.indexOf('--inbox') + 1];
        const id = after && /^\d+$/.test(after) ? Number(after) : null;
        urls = [...urls, ...(await fromInbox(id))];
    }

    if (urls.length === 0) {
        console.error('Usage: npm run diagnose -- [--record] <url> [<url> …]');
        console.error('       npm run diagnose -- [--record] --inbox [id]');
        process.exitCode = 1;
        return;
    }

    if (keep) {
        console.log(
            dim('Recording. Nothing secret is written: headers are never captured,\n' +
                'and anything key-shaped is replaced before the file is saved.')
        );
    }

    for (const url of urls) {
        try {
            await diagnose(url, keep);
        } catch (error) {
            console.error(red(`\n   Failed: ${error instanceof Error ? error.message : error}`));
        }
    }

    console.log('');
    await prisma.$disconnect().catch(() => undefined);
}

main();
