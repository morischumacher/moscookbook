import { redirect } from 'next/navigation';

/**
 * Invitations moved in with the accounts, onto one "People" page.
 *
 * The route stays and redirects rather than disappearing: this address has been
 * in the navigation, in browser histories and in at least one bookmark, and a
 * 404 is a poor way to announce that two pages became one.
 */
export default async function AdminInvitesPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    redirect(`/${locale}/admin/users`);
}
