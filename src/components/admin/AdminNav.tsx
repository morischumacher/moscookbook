'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { adminSectionFor } from '@/lib/navigation';

/**
 * The admin's own tools, on the admin's own pages.
 *
 * All of these used to be in the bar at the top of the site, next to Blog,
 * which produced a row of eight links in which "Entries" and "Blog" sat two
 * apart meaning two different things, and in which a guest with no account saw
 * a bar half the width of an admin's. Nothing in it said which one you were
 * looking at.
 *
 * They are not sections of the site. They are one section — the admin — with
 * rooms in it, so they live here, on the pages where they apply, and the top
 * bar is three words long again.
 *
 * ## Groups, and why they have no headings
 *
 * The row grew to ten entries in the order they were built, which is not an
 * order anybody reads in. It is three groups now:
 *
 *   the recipes and what turns into one — overview, inbox, drafts, collections
 *   the writing — blog entries
 *   the running of it — people, reports, devices, AI
 *
 * Separated by a rule and nothing else. A heading over each would say out loud
 * what the spacing already says, and cost three lines of a bar whose whole
 * job is to be small.
 *
 * ## Wrapping, not scrolling
 *
 * It used to scroll sideways, on the reasoning that six labels wrapped to
 * three lines push the page's heading below the fold. With ten entries that
 * reasoning had a cost nobody had noticed: on a phone the last two — Devices
 * and AI — were off the edge of a strip with no scrollbar, so unless you
 * happened to drag the row they did not exist. "Where is AI?" is a fair
 * question to ask of a navigation.
 *
 * It wraps now, and the groups are what it wraps on: each group stays
 * together on a line, so the break happens where the meaning already breaks.
 */
export default function AdminNav({ unresolvedReports = 0 }: { unresolvedReports?: number }) {
    const t = useTranslations('Admin');
    const tInbox = useTranslations('Inbox');
    const tDrafts = useTranslations('Drafts');
    const tBlog = useTranslations('Blog');
    const tCollections = useTranslations('Collections');
    const tReports = useTranslations('Reports');
    const tDevices = useTranslations('Devices');
    const tAi = useTranslations('Ai');

    const current = adminSectionFor(usePathname());

    // Spelled out rather than built in a loop, so every key is visible to the
    // translation checker.
    const groups: { href: string; label: string; count?: number }[][] = [
        [
            // In the order the work arrives: shared into the inbox, taken in
            // as a draft, finished into a recipe, arranged into collections,
            // written about. Every link is a noun — the section — and making
            // a new thing is a button on that section's page.
            { href: '/admin/inbox', label: tInbox('nav') },
            { href: '/admin/drafts', label: tDrafts('nav') },
            { href: '/admin', label: t('dashboard') },
            { href: '/admin/collections', label: tCollections('adminNav') },
            { href: '/admin/posts', label: tBlog('adminNav') },
        ],
        [
            { href: '/admin/users', label: t('people') },
            { href: '/admin/reports', label: tReports('nav'), count: unresolvedReports },
            { href: '/admin/devices', label: tDevices('nav') },
            { href: '/admin/ai', label: tAi('nav') },
        ],
    ];

    return (
        <nav aria-label={t('adminNavLabel')} className="print:hidden border-b border-line">
            {/*
                Left-aligned, like the page headings below it and unlike the
                site's own bar, which is pushed right. Two bars above one
                another, one centred and one not, was the visual answer to
                "am I in the admin?" being "look closely".
            */}
            <div className="container mx-auto max-w-3xl px-4 md:px-8">
                {/* One row that scrolls sideways on a phone, like an app's tab bar,
                    rather than two rows of links that push the page down. */}
                <div className="-mx-4 flex items-center gap-x-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
                    {groups.map((group, index) => (
                        <div key={group[0].href} className="flex shrink-0 items-center">
                            {index > 0 && (
                                <span
                                    aria-hidden="true"
                                    className="mx-2 h-4 w-px shrink-0 bg-line"
                                />
                            )}

                            <ul className="flex items-center gap-1">
                                {group.map((link) => {
                                    const here = current === link.href;

                                    return (
                                        <li key={link.href}>
                                            <Link
                                                href={link.href}
                                                // Read out as the current page,
                                                // not only drawn as one.
                                                aria-current={here ? 'page' : undefined}
                                                className={`-mb-px inline-block whitespace-nowrap border-b-2 px-2 py-3 text-sm transition-colors ${
                                                    here
                                                        ? 'border-ink font-semibold text-ink'
                                                        : 'border-transparent text-muted hover:text-ink'
                                                }`}
                                            >
                                                {link.label}
                                                {/* A count, only when there is
                                                    one. Read out as part of the
                                                    link text, so a screen reader
                                                    hears "Reports, 3" rather than
                                                    a link and then a stray
                                                    number. */}
                                                {(link.count ?? 0) > 0 && (
                                                    <span
                                                        className="ml-1.5 inline-block min-w-[1.25rem] rounded-full bg-danger-surface px-1.5 text-center text-xs font-semibold text-danger"
                                                        aria-label={`, ${link.count ?? 0}`}
                                                    >
                                                        {(link.count ?? 0) > 99 ? '99+' : link.count}
                                                    </span>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </nav>
    );
}
