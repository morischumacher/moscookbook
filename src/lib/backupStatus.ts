import { optionalTable } from './prismaTable';

/**
 * When the scheduled backup last ran, and how it went.
 *
 * The weekly backup returned a 500 to the scheduler on failure and persisted
 * nothing. From inside the app, a backup that had been failing for a month
 * was indistinguishable from one that ran — the highest consequence per
 * occurrence of anything the audit found, because a backup is the thing you
 * only discover is broken on the day you need it.
 *
 * Two rows in `AppSetting`, which is the table for knobs and small facts
 * about this deployment. Written by the cron route, read by the dashboard.
 * A failure is also recorded in the error log through `failed()`, so it
 * carries a count into the nav; this is the other half — the date you can
 * see on the page that lists the backups.
 */
const LAST_RUN = 'backup.lastRunAt';
const LAST_RESULT = 'backup.lastResult';

export interface BackupStatus {
    lastRunAt: Date | null;
    /** A short sentence: what was written, or what went wrong. */
    lastResult: string | null;
}

type Delegate = {
    findMany: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<unknown>;
};

function settings(): Delegate | null {
    return optionalTable<Delegate>('appSetting', 'findMany', 'The backup date on the dashboard is blank until you do.');
}

export async function recordBackupRun(result: string, ok: boolean): Promise<void> {
    const model = settings();
    if (!model) return;

    const now = new Date().toISOString();
    const value = `${ok ? 'ok' : 'failed'}: ${result}`.slice(0, 500);

    await Promise.all([
        model.upsert({ where: { key: LAST_RUN }, update: { value: now }, create: { key: LAST_RUN, value: now } }),
        model.upsert({ where: { key: LAST_RESULT }, update: { value }, create: { key: LAST_RESULT, value } }),
    ]).catch(() => undefined);
}

export async function backupStatus(): Promise<BackupStatus> {
    const model = settings();
    if (!model) return { lastRunAt: null, lastResult: null };

    const rows = (await model
        .findMany({ where: { key: { in: [LAST_RUN, LAST_RESULT] } } })
        .catch(() => [])) as { key: string; value: string }[];

    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const raw = byKey.get(LAST_RUN);
    const at = raw ? new Date(raw) : null;

    return {
        lastRunAt: at && !Number.isNaN(at.getTime()) ? at : null,
        lastResult: byKey.get(LAST_RESULT) ?? null,
    };
}
