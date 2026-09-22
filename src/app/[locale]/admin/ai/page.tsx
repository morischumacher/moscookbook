import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import AiKeys from '@/components/admin/AiKeys';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

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
    const tDevices = await getTranslations('Devices');

    return (
        <main className={`${pageContainer} pb-32`}>
            <div
                className={`mb-8 flex flex-wrap items-baseline justify-between gap-4 ${pageTop} ${pageHeading}`}
            >
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
                <Link href="/admin/devices" className="text-sm underline underline-offset-4">
                    {tDevices('nav')}
                </Link>
            </div>

            <p className="mb-10 font-serif text-muted">{t('intro')}</p>

            <AiKeys />
        </main>
    );
}
