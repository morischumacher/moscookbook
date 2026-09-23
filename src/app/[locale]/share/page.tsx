import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';
import ShareIntoInbox from '@/components/admin/ShareIntoInbox';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Where the share sheet lands (see app/manifest.ts). Sends what was shared to
 * the inbox and says so; the reading happens there, in the background.
 */
export default async function SharePage({
    searchParams,
}: {
    searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
    const [{ title = '', text = '', url = '' }, user, t, head] = await Promise.all([
        searchParams,
        getCurrentUser(),
        getTranslations('ShareTarget'),
        headers(),
    ]);

    /*
     * The share sheet opens this page as a top-level navigation of its own
     * (Sec-Fetch-Site "none"). A link on another site that points here is
     * "cross-site" — and would otherwise make the admin's session file
     * whatever that site chose into the inbox, and spend tokens on it. Then a
     * button has to be pressed first.
     */
    const fetchSite = head.get('sec-fetch-site');
    const confirm = fetchSite === 'cross-site' || fetchSite === 'same-site';

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-6`}>{t('title')}</h1>
            {user?.admin ? (
                <ShareIntoInbox title={title} text={text} url={url} confirm={confirm} />
            ) : (
                <p className="text-muted">{t('adminOnly')}</p>
            )}
        </main>
    );
}
