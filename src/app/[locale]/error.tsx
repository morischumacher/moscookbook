'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import ErrorReporter from '@/components/ErrorReporter';

/**
 * What a visitor sees when a page fails, and what tells us it did.
 *
 * Two jobs, and the order matters: the person gets a way out of the dead end
 * first, and the report goes out quietly alongside. No stack trace on screen —
 * it helps nobody standing in a kitchen and tells a stranger about the
 * internals.
 */
export default function LocaleError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations('ErrorPage');

    return (
        <main className="container mx-auto max-w-lg px-4 pb-32 pt-20 text-center">
            <ErrorReporter error={error} />

            <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{t('title')}</h1>
            <p className="mb-8 font-serif text-muted">{t('explanation')}</p>

            <div className="flex flex-wrap items-center justify-center gap-4">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-full bg-ink px-6 py-3 font-medium text-page"
                >
                    {t('retry')}
                </button>
                <Link href="/" className="underline underline-offset-4">
                    {t('home')}
                </Link>
            </div>

            {/* The digest is the one thing worth showing: it is what connects
                what the visitor saw to a row in the error list. */}
            {error.digest && (
                <p className="mt-10 text-xs uppercase tracking-widest text-faint">
                    {t('reference', { digest: error.digest })}
                </p>
            )}
        </main>
    );
}
