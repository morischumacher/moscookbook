#!/usr/bin/env ts-node
/**
 * One import, traced end to end, against the real thing.
 *
 *   npm run diagnose -- https://www.chefkoch.de/rezepte/…
 *   npm run diagnose -- --record https://www.chefkoch.de/rezepte/…
 *   npm run diagnose -- --inbox            (every open capture)
 *   npm run diagnose -- --inbox 42         (one of them, by id)
 *   npm run diagnose -- --models           (which models answer on this key)
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

import { describeJsonLd, extractRecipeFromHtml } from '../src/lib/recipeFromHtml';
import { fetchPage } from '../src/lib/fetchPage';
import { readableText } from '../src/lib/readableText';
import { assessDraft } from '../src/lib/draftQuality';
import { captureInputFrom } from '../src/lib/captureInput';
import { processCapture } from '../src/lib/captureProcess';
import prisma from '../src/lib/prisma';
import { hostOf } from '../src/lib/siteProfile';
import { siteProfiles } from '../src/lib/siteProfileDb';
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
    /*
     * Not "is there JSON-LD" — "is there a recipe in it".
     *
     * The old line tested for the string `application/ld+json` and printed a
     * green "yes" directly above "ingredients: 0", which reads like a broken
     * parser. Both lines were true: the page describes a blog post and carries
     * no Recipe at all. Saying so is the difference between a bug to fix and a
     * page that will always need a model.
     */
    const structured = describeJsonLd(page.html);
    if (structured.blocks === 0) {
        line('recipe in JSON-LD', red('no JSON-LD on the page'));
    } else if (structured.hasRecipe) {
        line('recipe in JSON-LD', green('yes'));
    } else {
        const seen = structured.types.slice(0, 6).join(', ') || 'nothing typed';
        const unreadable = structured.blocks - structured.parsed;
        line(
            'recipe in JSON-LD',
            `${red('no')} — ${structured.blocks} block(s), describing: ${seen}` +
                (unreadable > 0 ? ` (${unreadable} could not be parsed)` : '')
        );
    }

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

        /*
         * What we already know about this site, printed before the run rather
         * than after, because it changes how everything below should be read.
         * A profile in use means the recipe came from a mapping a model wrote
         * some time ago against a page that may since have changed.
         */
        const host = hostOf(page.finalUrl);
        const known = host ? await siteProfiles.load(host) : null;

        if (!host) {
            line('learned layout', dim('—'));
        } else if (!known) {
            line('learned layout', `${dim('nothing learned yet for')} ${host}`);
        } else {
            const age = Math.round((Date.now() - known.learnedAt.getTime()) / 86_400_000);
            line(
                'learned layout',
                `${green(host)} — learned ${age === 0 ? 'today' : `${age} day(s) ago`} from ${known.learnedBy}`
            );
            for (const [field, strategy] of Object.entries(known.profile)) {
                const how =
                    strategy.kind === 'meta'
                        ? strategy.property
                        : strategy.kind === 'selector'
                            ? strategy.selector
                            : strategy.kind === 'jsonLd'
                                ? strategy.path
                                : strategy.heading;
                console.log(dim(`      ${field.padEnd(12)} ${strategy.kind} · ${how}`));
            }
            if (known.failures > 0) {
                console.log(yellow(`      ${known.failures} recent import(s) fell short of the scoring`));
            }
        }

        const result = await processCapture(classified, ai, {
            profiles: siteProfiles,
            // The diagnose script learns with whatever key the import itself
            // would use. The app gets its own setting for this; here the point
            // is to exercise the path, not to spend more on it.
            learnWith: ai.keys[0],
        });

        line('status', result.status === 'ready' ? green(result.status) : yellow(result.status));
        // Plain for the two paths no model touched, so the colour keeps
        // meaning "a model was involved" here as it does in the inbox.
        line(
            'read by',
            result.readBy === 'rules' || result.readBy === 'profile'
                ? result.readBy
                : green(result.readBy)
        );
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

    /*
     * Rows whose "address" is a recipe.
     *
     * Before 049f62e a note shared from Apple Notes went into `sourceUrl`
     * whole, so the inbox holds `failed` captures with several hundred
     * characters of prose where a link should be. Fetching those produced
     * "Could not be read: unsafe-url" five times in a row, which is true and
     * unhelpful. Migration 0023 repairs them; until it has run, they are named
     * and skipped rather than dragged through the pipeline.
     */
    const usable = rows.filter((row) => /^https?:\/\/\S+$/.test((row.sourceUrl ?? '').trim()));
    const broken = rows.length - usable.length;

    if (rows.length === 0) {
        console.error('No captures with a link found.');
        return [];
    }

    console.log(dim(`${usable.length} capture(s) from the inbox:`));
    for (const row of usable) {
        console.log(dim(`   #${row.id}  ${row.status.padEnd(10)} ${row.sourceUrl}`));
    }

    if (broken > 0) {
        console.log(
            yellow(
                `\n   ${broken} capture(s) hold text where a link should be — the Apple Notes\n` +
                '   bug fixed in 049f62e. Migration 0023 moves them back; run\n' +
                '   `npx prisma migrate deploy` and then press retry on them in the inbox.'
            )
        );
    }

    return usable.map((row) => row.sourceUrl as string);
}

/**
 * Which models this key can actually reach.
 *
 * Added after watching `gemini-flash-latest` answer 503 three times and then
 * 429 "you exceeded your current quota". An alias that always points at the
 * current model is the right idea and is worth nothing if the current model is
 * the busiest one on the platform, or if the free tier has no quota for it.
 *
 * The only way to know is to ask, so this asks: the smallest possible prompt,
 * to each candidate in turn, reporting what came back. What it produces is the
 * one thing that cannot be looked up — what works *on this account, today*.
 */
const CANDIDATES = [
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
];

async function probeModels(): Promise<void> {
    const ai = await aiCapability();
    const key = ai.keys.find((entry) => entry.provider === 'google');

    if (!key) {
        console.error(red('No Google key is configured, so there is nothing to probe.'));
        console.error(dim('Set one under Admin → AI, press Test once, and try again.'));
        return;
    }

    console.log(bold('\nAsking each model one short question.\n'));
    console.log(dim('Costs a few tokens per line. A model that answers here is one\n' +
        'you can put in the model field on the AI screen.\n'));

    for (const model of CANDIDATES) {
        process.stdout.write(`   ${model.padEnd(28)} `);

        const started = performance.now();

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': key.apiKey },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'Reply with the word: ok' }] }],
                    }),
                }
            );

            const ms = Math.round(performance.now() - started);

            if (response.ok) {
                console.log(green(`ok    ${ms} ms`));
                continue;
            }

            const body = await response.text().catch(() => '');
            const message = /"message":\s*"([^"]{0,110})/.exec(body)?.[1] ?? '';
            console.log(red(`${response.status}`) + dim(`   ${ms} ms  ${message}`));
        } catch (error) {
            console.log(red('failed') + dim(`   ${error instanceof Error ? error.message : ''}`));
        }
    }

    console.log(
        dim('\n   Put a working one in the model field under Admin → AI.\n' +
            '   Leave it empty to keep the default, which is gemini-flash-latest.\n')
    );
}

/**
 * The one failure worth naming before anything else runs.
 *
 * Prisma's client is generated from the schema by `postinstall`, and is not in
 * the repository. Pull a branch that adds a table, run this before `npm
 * install`, and every query in `aiConfig` throws `Cannot read properties of
 * undefined (reading 'findMany')` — which says nothing about the missing build
 * step that caused it. It cost a round trip.
 */
function clientKnowsTheSchema(): boolean {
    const client = prisma as unknown as Record<string, unknown>;
    return Boolean(client.appSetting && client.aiCredential);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const keep = args.includes('--record');

    if (args.includes('--models')) {
        if (!clientKnowsTheSchema()) {
            console.error(red('Run `npx prisma generate` first.'));
            process.exitCode = 1;
            return;
        }
        await probeModels();
        return;
    }

    let urls = args.filter((argument) => argument.startsWith('http'));

    if (args.includes('--inbox')) {
        const after = args[args.indexOf('--inbox') + 1];
        const id = after && /^\d+$/.test(after) ? Number(after) : null;
        urls = [...urls, ...(await fromInbox(id))];
    }

    if (urls.length === 0) {
        console.error('Usage: npm run diagnose -- [--record] <url> [<url> …]');
        console.error('       npm run diagnose -- [--record] --inbox [id]');
        console.error('       npm run diagnose -- --models');
        process.exitCode = 1;
        return;
    }

    if (!clientKnowsTheSchema()) {
        console.error(
            red('\nThe Prisma client is older than the schema.\n') +
            'Run:  npx prisma generate\n\n' +
            dim('It is generated by postinstall and is not in the repository, so a\n' +
                'freshly merged branch has tables the client has never heard of.\n' +
                'Everything below would run with the AI switched off.\n')
        );
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
}

// One place to close the connection, whatever happened above — an unhandled
// rejection used to leave the process hanging on an open pool after the first
// URL failed, which looked like the script itself being broken.
main()
    .catch((error) => {
        console.error(red(`\n${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect().catch(() => undefined));
