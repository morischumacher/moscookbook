import prisma from './prisma';
import type { AccountSiteStore } from './authorSite';

/** The remembered account → website pairs. See authorSite.ts. */
export const accountSites: AccountSiteStore = {
    async get(platform, handle) {
        const row = await prisma.accountSite.findUnique({
            where: { platform_handle: { platform, handle } },
            select: { host: true },
        });
        return row?.host ?? null;
    },
    async remember(platform, handle, host) {
        await prisma.accountSite.upsert({
            where: { platform_handle: { platform, handle } },
            create: { platform, handle, host },
            update: { host },
        });
    },
};
