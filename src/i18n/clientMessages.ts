import type { AbstractIntlMessages } from 'next-intl';

/**
 * Which translations are sent to the browser, and where.
 *
 * The layout used to hand the whole file to the client provider, so every
 * page carried all ~45 KB of both the public site's words and the admin's —
 * AI key instructions, device set-up, the backup panel — inside its HTML, on a
 * phone that would never open an admin page.
 *
 * Public pages get everything except the admin's own namespaces and the ones
 * only the server reads. The admin layout wraps its pages in a second
 * provider with the whole file (a nested provider replaces rather than
 * merges, so it has to be the whole file).
 *
 * A namespace missing here shows up at once, as the key's name on screen
 * instead of its text — and `tests/clientMessages.test.ts` checks that every
 * namespace a public component asks for is sent.
 */
export const ADMIN_ONLY_NAMESPACES = [
    'Devices',
    'Ai',
    'SiteProfiles',
    'Backup',
    'Invites',
    'Reports',
    'Work',
    'Inbox',
    'QuickImport',
    'RecipeForm',
    'Errors',
    'Examples',
    'ForeignImport',
] as const;

/** Read only by server components through getTranslations, never sent. */
export const SERVER_ONLY_NAMESPACES = ['Legal', 'Site', 'NotFound', 'Visibility', 'Loading'] as const;

const WITHHELD = new Set<string>([...ADMIN_ONLY_NAMESPACES, ...SERVER_ONLY_NAMESPACES]);

export function publicClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
    return Object.fromEntries(Object.entries(messages).filter(([namespace]) => !WITHHELD.has(namespace)));
}
