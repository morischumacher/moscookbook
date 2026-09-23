/**
 * The `SiteProfileStore` backed by the database.
 *
 * Separate from `siteProfile.ts` so that the reading and the storing are not
 * the same module: `captureProcess` imports the first and must never import
 * Prisma, because a module that does cannot be loaded by the test runner. This
 * is the same split `aiConfig` and `captureProcess` already use.
 *
 * Nothing in here is secret. A row holds heading texts and meta tag names —
 * facts about a public web page — so unlike `aiConfig` there is no sealing, no
 * redaction and nothing that must stay out of a log.
 */

import { optionalTable } from './prismaTable';
import { canUseAi, type AiCapability } from './aiProviders';
import type { ProcessOptions } from './captureTypes';
import {
    FAILURES_BEFORE_STALE,
    profileFromStored,
    type SiteProfile,
    type SiteProfileStore,
    type StoredProfile,
} from './siteProfile';

interface Row {
    host: string;
    profile: string;
    learnedFrom: string;
    learnedBy: string;
    learnedAt: Date;
    usedAt: Date | null;
    failures: number;
    stale: boolean;
    lastError: string | null;
}

// `Promise<unknown>` throughout, like aiConfig: without a generated client
// there is nothing truer to say, and the reads below annotate what they get.
type Delegate = {
    findUnique: (args: unknown) => Promise<unknown>;
    findMany: (args?: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
};

function table(): Delegate | null {
    return optionalTable<Delegate>(
        'siteProfile',
        'findUnique',
        'Imports still work; they just ask a model every time instead of remembering how a site is laid out.'
    );
}

function toStored(row: Row): StoredProfile | null {
    const profile = profileFromStored(row.profile);
    if (!profile) return null;

    return {
        host: row.host,
        profile,
        learnedFrom: row.learnedFrom,
        learnedBy: row.learnedBy,
        learnedAt: row.learnedAt,
        failures: row.failures,
        stale: row.stale,
    };
}

export const siteProfiles: SiteProfileStore = {
    async load(host: string): Promise<StoredProfile | null> {
        const model = table();
        if (!model) return null;

        const row = (await model.findUnique({ where: { host } })) as Row | null;
        if (!row || row.stale) return null;

        return toStored(row);
    },

    async save(input): Promise<void> {
        const model = table();
        if (!model) return;

        const profile = JSON.stringify(input.profile);

        // Re-learning is the recovery path for a site that changed, so a save
        // clears the failure count and the stale flag: the whole point of
        // arriving here is that the new profile has just been verified.
        await model.upsert({
            where: { host: input.host },
            create: {
                host: input.host,
                profile,
                learnedFrom: input.learnedFrom,
                learnedBy: input.learnedBy,
            },
            update: {
                profile,
                learnedFrom: input.learnedFrom,
                learnedBy: input.learnedBy,
                learnedAt: new Date(),
                failures: 0,
                stale: false,
                lastError: null,
            },
        });
    },

    async recordUse(host: string, ok: boolean, error?: string): Promise<void> {
        const model = table();
        if (!model) return;

        if (ok) {
            // Reset rather than decrement: two good imports either side of one
            // bad page should not leave a profile one step from being retired.
            await model
                .update({ where: { host }, data: { usedAt: new Date(), failures: 0, lastError: null } })
                .catch(() => undefined);
            return;
        }

        const row = (await model.findUnique({ where: { host } }).catch(() => null)) as Row | null;
        if (!row) return;

        const failures = row.failures + 1;

        await model
            .update({
                where: { host },
                data: {
                    failures,
                    stale: failures >= FAILURES_BEFORE_STALE,
                    lastError: (error ?? 'the draft did not pass the quality check').slice(0, 500),
                },
            })
            .catch(() => undefined);
    },
};

/* -------------------------------------------------------------------------- */
/*  For the diagnose script and, later, an admin page                          */
/* -------------------------------------------------------------------------- */

export interface SiteProfileView {
    host: string;
    profile: SiteProfile | null;
    learnedFrom: string;
    learnedBy: string;
    learnedAt: Date;
    usedAt: Date | null;
    failures: number;
    stale: boolean;
    lastError: string | null;
}

export async function listSiteProfiles(): Promise<SiteProfileView[]> {
    const model = table();
    if (!model) return [];

    const rows = (await model.findMany({ orderBy: { host: 'asc' } })) as Row[];

    return rows.map((row) => ({
        host: row.host,
        profile: profileFromStored(row.profile),
        learnedFrom: row.learnedFrom,
        learnedBy: row.learnedBy,
        learnedAt: row.learnedAt,
        usedAt: row.usedAt,
        failures: row.failures,
        stale: row.stale,
        lastError: row.lastError,
    }));
}

/** Forgets a site, so the next import from it learns afresh. */
export async function forgetSite(host: string): Promise<void> {
    const model = table();
    if (!model) return;

    await model.delete({ where: { host } }).catch(() => undefined);
}

/**
 * What an import needs in order to use what has been learned, and to learn.
 *
 * Every caller of `processCapture` spreads this into its options. Until it
 * existed, none of them passed `profiles` or `learnWith`: the pipeline could
 * read and learn site profiles, and was never given the store to do it with.
 * The inbox filled with "rules plus AI" for sites it should long since have
 * known, and the learned-sites list stayed empty.
 *
 * Learning uses the first key in the fallback order — the one the import
 * itself would try first — and only when the AI is switched on at all. It
 * happens only after a model has already read a page and helped, so it costs
 * one more call per new site, once.
 */
export function siteLearning(ai: AiCapability): Pick<ProcessOptions, 'profiles' | 'learnWith'> {
    return {
        profiles: siteProfiles,
        learnWith: canUseAi(ai) ? ai.keys[0] : undefined,
    };
}
