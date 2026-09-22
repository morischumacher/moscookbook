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

import prisma from './prisma';
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

interface Delegate {
    findUnique(args: unknown): Promise<Row | null>;
    findMany(args?: unknown): Promise<Row[]>;
    upsert(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    delete(args: unknown): Promise<unknown>;
}

let warned = false;

/**
 * The table, or null if the generated client has never heard of it.
 *
 * `prisma.siteProfile` is `undefined` until `prisma generate` has run against
 * a schema containing it — which is the state of every checkout that has just
 * merged this branch. Calling a method on it throws a *synchronous*
 * `TypeError`, so a `.catch()` does not help and the whole import dies. This
 * has happened once already, with `appSetting`, and cost an evening.
 *
 * So: warn once, return null, and let the import behave exactly as it does on
 * a site nothing has been learned about. Profiles are an optimisation; nothing
 * may depend on them existing.
 */
function table(): Delegate | null {
    const model = (prisma as unknown as Record<string, Delegate | undefined>).siteProfile;

    if (!model || typeof model.findUnique !== 'function') {
        if (!warned) {
            warned = true;
            console.warn(
                'The Prisma client does not know about "siteProfile" yet. ' +
                'Run `npx prisma generate`. Imports still work; they just ask a model ' +
                'every time instead of remembering how a site is laid out.'
            );
        }
        return null;
    }

    return model;
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

        const row = await model.findUnique({ where: { host } });
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

        const row = await model.findUnique({ where: { host } }).catch(() => null);
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

    const rows = await model.findMany({ orderBy: { host: 'asc' } });

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
