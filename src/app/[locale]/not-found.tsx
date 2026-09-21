import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Oyster from '@/components/brand/Oyster';

/**
 * A page that is not there.
 *
 * `notFound()` is called from six places — a recipe slug that has been renamed,
 * an entry that was never published, a share link that has been withdrawn — and
 * all six landed on Next's built-in 404: black on white, in English whatever
 * the visitor was reading, with no navigation and nothing of this site about
 * it. Somebody following a link you sent last year met a page that looked like
 * the site had been taken down.
 *
 * It is a page of the cookbook now, in the reader's own language, with the way
 * back on it. Nothing else: a 404 that tries to guess what you meant is a 404
 * that keeps you on a page you did not want.
 */
export default async function NotFound() {
    const t = await getTranslations('NotFound');

    return (
        <main className="container mx-auto flex max-w-lg flex-col items-center px-4 pb-32 pt-24 text-center">
            {/* The oyster on its own, as a mark rather than an error sign. The
                shell is empty, which is the joke and also the state. */}
            <span className="mb-8 text-faint">
                <Oyster size={64} />
            </span>

            <h1 className="mb-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t('title')}
            </h1>

            <p className="mb-10 font-serif text-lg leading-relaxed text-muted">
                {t('explanation')}
            </p>

            <Link
                href="/"
                className="rounded-full bg-ink px-6 py-3 font-medium text-page transition-opacity hover:opacity-85"
            >
                {t('toRecipes')}
            </Link>
        </main>
    );
}
