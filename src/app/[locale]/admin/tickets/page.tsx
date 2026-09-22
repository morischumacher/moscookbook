import { redirect } from 'next/navigation';

/**
 * Errors and tickets became one page, "Reports".
 *
 * They were the same question from two sides — what the application noticed
 * and what a person noticed — and two entries in the navigation for that was
 * two taps and a decision about which to look at first.
 *
 * The address stays and redirects. Both have been in the navigation and in
 * browser histories, and a 404 is a poor way to say two pages became one.
 */
export default async function AdminTicketsMovedPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    redirect(`/${locale}/admin/reports`);
}
