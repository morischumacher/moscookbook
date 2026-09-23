import { redirect } from 'next/navigation';
import { titled } from '@/lib/metaTitle';

export const generateMetadata = titled('Drafts', 'title', false);

/**
 * Drafts moved under /admin, where the rest of the admin's rooms are.
 *
 * It was the one tool in the admin's navigation that lived outside it, which
 * had two consequences nobody had set out to cause: arriving there made the
 * admin navigation disappear, so the only way onward was the site header; and
 * the page's access was `account` rather than `admin`, so any signed-in person
 * could open a list of half-finished recipes and find no button to finish one,
 * because finishing is the admin's.
 *
 * The old address stays and redirects. It has been in the navigation and in
 * browser histories, and a 404 is a poor way to say a page moved one level in.
 */
export default async function DraftsMovedPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    redirect(`/${locale}/admin/drafts`);
}
