import type { Metadata } from 'next';
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
    const [{ title = '', text = '', url = '' }, user, t] = await Promise.all([
        searchParams,
        getCurrentUser(),
        getTranslations('ShareTarget'),
    ]);

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-6`}>{t('title')}</h1>
            {user?.admin ? (
                <ShareIntoInbox title={title} text={text} url={url} />
            ) : (
                <p className="text-muted">{t('adminOnly')}</p>
            )}
        </main>
    );
}
