'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { adminSectionFor } from '@/lib/navigation';

/**
 * The admin's own tools, on the admin's own pages.
 *
 * All six of these used to be in the bar at the top of the site, next to Blog,
 * which produced a row of eight links in which "Entries" and "Blog" sat two
 * apart meaning two different things, and in which a guest with no account saw
 * a bar half the width of an admin's. Nothing in it said which one you were
 * looking at.
 *
 * They are not sections of the site. They are one section — the admin — with
 * rooms in it, so they live here, on the pages where they apply, and the top
 * bar is three words long again.
 *
 * It scrolls sideways on a phone rather than wrapping: six labels wrapped to
 * three lines push the page's own heading below the fold, and a strip that
 * moves is easier to read than a block that has to be read.
 */
export default function AdminNav() {
    const t = useTranslations('Admin');
    const tInbox = useTranslations('Inbox');
    const tBlog = useTranslations('Blog');
    const tCollections = useTranslations('Collections');
    const tErrors = useTranslations('Errors');
    const tDevices = useTranslations('Devices');
    const tTickets = useTranslations('Tickets');

    const current = adminSectionFor(usePathname());

    // Spelled out rather than built in a loop, so every key is visible to the
    // translation checker.
    const links = [
        { href: '/admin', label: t('dashboard') },
        { href: '/admin/inbox', label: tInbox('nav') },
        { href: '/admin/posts', label: tBlog('adminNav') },
        { href: '/admin/collections/new', label: tCollections('createNew') },
        { href: '/admin/users', label: t('people') },
        { href: '/admin/tickets', label: tTickets('nav') },
        { href: '/admin/errors', label: tErrors('nav') },
        { href: '/admin/devices', label: tDevices('nav') },
    ];

    return (
        <nav
            aria-label={t('adminNavLabel')}
            className="print:hidden border-b border-line"
        >
            <div className="container mx-auto max-w-3xl px-4 md:px-8">
                <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {links.map((link) => {
                        const here = current === link.href;

                        return (
                            <li key={link.href} className="shrink-0">
                                <Link
                                    href={link.href}
                                    // Read out as the current page, not only
                                    // drawn as one.
                                    aria-current={here ? 'page' : undefined}
                                    className={`-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                                        here
                                            ? 'border-ink font-semibold text-ink'
                                            : 'border-transparent text-muted hover:text-ink'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
}
