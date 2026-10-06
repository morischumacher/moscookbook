import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentUserVerified } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { needsYouCount } from '@/lib/workItemsDb';
import AdminNav from '@/components/admin/AdminNav';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { titled } from '@/lib/metaTitle';
import { ingredientTodo } from '@/lib/ingredientUnitsDb';

/** "Verwaltung — mo'scookbook" for every admin page that does not name itself. */
export const generateMetadata = titled('Navigation', 'admin', false);

// The proxy also guards /admin, from the cookie. This is the check that asks
// the database — so a person demoted or deleted five minutes ago does not keep
// reading admin pages for the fortnight their cookie has left. One lookup per
// admin page, cached for the request.
export default async function AdminLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const user = await currentUserVerified();

    if (!user?.admin) {
        redirect(`/${locale}/login`);
    }

    /*
     * How much is waiting to be dealt with, so the nav can say so.
     *
     * The page existed and was the only place the number could be seen, which
     * is the same shape as the problem it was built to fix — a place somebody
     * has to go and look. A small number next to the word is what turns
     * "there is a page" into "there is something on it".
     *
     * Both sides counted together, since they became one entry: an admin
     * wants to know whether anything is waiting, not whether it arrived as a
     * stack trace or as a sentence. Fails to zero rather than failing the
     * page.
     *
     * Only what needs *you*: open and not with the AI, plus what the AI
     * reports done and waits for your confirmation. Counting every open
     * error kept a number up that nobody but the AI could bring down.
     */
    const [errorCount, ticketCount, toConfirm, ingredients] = await Promise.all([
        needsYouCount('error'),
        needsYouCount('ticket'),
        prisma.workItem.count({ where: { doneAt: { not: null }, closedAt: null, dismissedAt: null } }).catch(() => 0),
        // Unit conflicts to decide, and the gathered conversions once it is time for the AI (lib/ingredientUnitsDb).
        ingredientTodo().catch(() => ({ conflicts: 0, conversions: 0, due: false })),
    ]);
    const ingredientCount = ingredients.conflicts + (ingredients.due ? ingredients.conversions : 0);
    const unresolvedReports = errorCount + ticketCount + toConfirm;

    // The admin's tools are a navigation of their own, rendered once here
    // rather than by each page, so that every page under /admin has it and no
    // page has to remember to draw a way back.
    return (
        // Every translation, including the admin's own, which the site-wide
        // provider leaves out. See i18n/clientMessages.
        <NextIntlClientProvider messages={await getMessages()}>
            <AdminNav unresolvedReports={unresolvedReports} ingredientTodo={ingredientCount} />
            {children}
        </NextIntlClientProvider>
    );
}
