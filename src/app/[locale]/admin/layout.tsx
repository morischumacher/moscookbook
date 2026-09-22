import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentUserVerified } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminNav from '@/components/admin/AdminNav';

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
     * How many errors are waiting, so the nav can say so.
     *
     * The error page existed and was the only place the number could be
     * seen, which is the same shape as the problem it was built to fix —
     * a place somebody has to go and look. One count per admin page load;
     * the pages under /admin are where an admin already is, and a small
     * number next to the word is what turns "there is a page" into "there is
     * something on it". Fails to zero rather than failing the page.
     */
    const unresolvedErrors: number = await prisma.errorLog
        .count({ where: { resolvedAt: null } })
        .catch(() => 0);

    // The admin's tools are a navigation of their own, rendered once here
    // rather than by each page, so that every page under /admin has it and no
    // page has to remember to draw a way back.
    return (
        <>
            <AdminNav unresolvedErrors={unresolvedErrors} />
            {children}
        </>
    );
}
