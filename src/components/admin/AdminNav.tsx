'use client';

import { useEffect, useRef, useState } from 'react';
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
 * ## A tab strip on a phone
 *
 * One row that scrolls sideways, like an app's tab bar, rather than two or
 * three rows of links pushing the page down; on a laptop it wraps. Three
 * things make the strip behave like a native one, and each was a complaint:
 *
 *   - it only scrolls sideways. `overflow-x: auto` quietly makes the other
 *     axis scrollable too, and the tabs' 1px underline overhang was enough
 *     for the whole strip to wobble up and down under a thumb;
 *   - the current tab is scrolled into view, so opening "People" does not
 *     leave it cut off at the edge as "Peop";
 *   - the edge fades while there is more to the right, which is what says
 *     "this scrolls" without a scrollbar.
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

    const strip = useRef<HTMLDivElement>(null);
    const [moreRight, setMoreRight] = useState(false);
    const measure = () => {
        const el = strip.current;
        if (el) setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    useEffect(() => {
        const el = strip.current;
        const here = el?.querySelector<HTMLElement>('[aria-current="page"]');
        // scrollLeft rather than scrollIntoView, which would also move the page.
        if (el && here && el.scrollWidth > el.clientWidth) {
            el.scrollLeft = Math.max(0, here.offsetLeft - (el.clientWidth - here.offsetWidth) / 2);
        }
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [current]);

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
                {/* See "A tab strip on a phone" above. */}
                <div
                    ref={strip}
                    onScroll={measure}
                    className={`-mx-4 flex touch-pan-x items-center gap-x-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:[mask-image:none] [&::-webkit-scrollbar]:hidden ${
                        moreRight ? '[mask-image:linear-gradient(to_right,black_85%,transparent)]' : ''
                    }`}
                >
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
                                                className={`inline-block whitespace-nowrap md:-mb-px border-b-2 px-2 py-3 text-sm transition-colors ${
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
                                                        aria-label={t('openCount', { count: link.count ?? 0 })}
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
