'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

/**
 * The link to the ticket form, carrying the page it was pressed on.
 *
 * **This exists because `document.referrer` does not work here.** The form
 * used to read it, which is the obvious way to answer "where were you" and is
 * wrong in this application: the referrer belongs to the *document*, and the
 * App Router moves between pages without loading a new one. So it freezes at
 * whatever the app was last cold-started with and stays there — for days, and
 * across the home-screen icon, which starts at the front page and inherits
 * nothing at all.
 *
 * What it produced was worse than nothing: a ticket opened from the home
 * screen arrived stamped with a recipe somebody had looked at the previous
 * evening. A field that is empty is a field you ignore; a field that is
 * confidently wrong sends whoever reads it to the wrong page.
 *
 * `usePathname` is the app's own idea of where it is, which is the thing that
 * was actually being asked for.
 *
 * The pathname only, never the query string. A reset link carries its token
 * there, and this writes what it captures into a database row.
 */
export default function TicketLink({ className }: { className?: string }) {
    const t = useTranslations('Tickets');
    const pathname = usePathname();

    // usePathname gives the path with the locale on it. The form shows it as
    // it is and the API stores it as it is: what is wanted here is the address
    // somebody can open, not a tidied version of it.
    const from = pathname && !pathname.includes('/tickets') ? pathname : null;

    return (
        <Link href={from ? `/tickets?from=${encodeURIComponent(from)}` : '/tickets'} className={className}>
            {t('nav')}
        </Link>
    );
}
