import { getTranslations } from 'next-intl/server';
import Loading from '@/components/ui/Loading';
import { pageContainer, pageTop } from '@/lib/ui';

/**
 * The wait between pressing a tab and the page arriving.
 *
 * This is the one that was never covered. Each admin page had a sentence in
 * grey for the moment *after* it had rendered and was fetching its own list;
 * none of them covered the moment before that, when the row of tabs has been
 * tapped and the server has not answered yet. On a phone, on a cold Vercel
 * function, that is the wait people describe as "I actively wait until it's
 * loaded" — and the screen showed the previous page, unchanged, giving no sign
 * the tap had registered at all.
 *
 * One file covers every page under /admin: Next renders it in place of the
 * page while the server works, and the layout around it — the header, the
 * admin navigation with the tapped tab already marked — stays put. Which is
 * what makes moving between these pages feel like moving inside one thing
 * rather than loading a series of separate ones.
 */
export default async function AdminLoading() {
    const t = await getTranslations('Admin');

    return (
        <main className={`${pageContainer} ${pageTop}`}>
            <Loading label={t('loadingPage')} size={32} />
        </main>
    );
}
