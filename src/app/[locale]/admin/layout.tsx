import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentUserVerified } from '@/lib/auth';
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

    // The admin's tools are a navigation of their own, rendered once here
    // rather than by each page, so that every page under /admin has it and no
    // page has to remember to draw a way back.
    return (
        <>
            <AdminNav />
            {children}
        </>
    );
}
