import { getTranslations } from 'next-intl/server';
import AiKeys from '@/components/admin/AiKeys';
import SiteProfiles from '@/components/admin/SiteProfiles';
import PageHeader from '@/components/admin/PageHeader';
import { pageContainer } from '@/lib/ui';

/**
 * The AI screen.
 *
 * Thin on purpose: everything on it changes in response to a button, so the
 * whole of it is the client component. What is here is the heading, the
 * explanation, and the one sentence that the rest of the page is built around
 * — that none of this is required, and the cookbook works with all of it empty.
 */
export default async function AdminAiPage() {
    const t = await getTranslations('Ai');

    return (
        <main className={`${pageContainer} pb-32`}>
            {/* This page was missed when the other seven were brought onto one
                header, and it still carried a back link to the devices page —
                which is exactly the "some have one and some do not" the
                unification was for. */}
            <PageHeader title={t('title')} intro={t('intro')} />

            <AiKeys />
            <SiteProfiles />
        </main>
    );
}
