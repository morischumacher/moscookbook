import prisma from './prisma';
import { generateToken, hashToken, tokenMatches } from './authTokens';

/**
 * The task key: what an assistant working through the task list uses to say
 * "this one is done". One key for the cookbook, made on the tasks page and
 * shown once; only its hash is kept. Making a new one retires the old.
 *
 * It can do exactly one thing — mark an open task as reported done, which
 * the admin then confirms or sends back. It closes nothing by itself and
 * reads nothing that is not already public, so a leaked key costs a wrong
 * "done" the admin will see before believing it.
 */
const KEY = 'workTokenHash';

export async function makeWorkToken(): Promise<string> {
    const token = `mcw_${generateToken()}`;
    const value = hashToken(token);
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    return token;
}

export async function hasWorkToken(): Promise<boolean> {
    return (await prisma.appSetting.findUnique({ where: { key: KEY }, select: { key: true } })) !== null;
}

/** Whether the request carries the current task key, as `Authorization: Bearer …`. */
export async function workTokenValid(header: string | null): Promise<boolean> {
    const token = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1];
    if (!token) return false;
    const stored = await prisma.appSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    return stored !== null && tokenMatches(token, stored.value);
}
