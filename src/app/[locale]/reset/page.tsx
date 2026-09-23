import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import ResetForm from '@/components/auth/ResetForm';
import { linkState } from '@/lib/linkState';
import { titled } from '@/lib/metaTitle';

export const generateMetadata = titled('Auth', 'resetTitle', false);

/**
 * Setting a new password from a mailed link.
 *
 * **The link is checked before the form is drawn.** This page used to render
 * the form whatever state the link was in, and only say "this link is no
 * longer valid" after somebody had invented a password, typed it twice and
 * pressed the button. Opening a spent link a second time — which people do,
 * because the mail is still in the inbox — looked exactly like opening a good
 * one, right up to the last moment.
 *
 * A form is a promise that filling it in will do something. Drawing one that
 * cannot work is a broken promise made deliberately, and here it wastes the
 * one thing the person came to do: think of a password. Worse, some of them
 * will leave believing it is set.
 *
 * So the check moved to the server, before the page exists. Nothing is spent
 * by looking — see lib/linkState.ts — and the form is still the thing that
 * redeems the link, so a link that dies in the half-minute between the page
 * loading and the button being pressed is still reported properly by the form
 * itself.
 *
 * Every dead end offers the way out, which is asking for a new link. A page
 * that says "no" without saying "instead" is a page somebody has to solve.
 */
export default async function ResetPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const t = await getTranslations('Auth');

    const raw = (await searchParams).token;
    const token = typeof raw === 'string' ? raw : undefined;

    const state = await linkState(token, 'reset');

    return (
        <main className="container mx-auto px-4 sm:max-w-sm pb-32 pt-16 sm:pt-24">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight">{t('resetTitle')}</h1>

            {state === 'valid' ? (
                <ResetForm token={token as string} />
            ) : (
                <div className="flex flex-col gap-6">
                    <p className="rounded-lg border border-danger-line bg-danger-surface p-4 text-sm text-danger">
                        {/* A link with no token at all is a different mistake
                            from a link that has been used: one is a mangled
                            address, the other is a link that did its job. Both
                            lead to the same door, but saying which happened
                            saves somebody hunting for a second copy of a mail
                            that would not have worked either. */}
                        {state === 'missing' ? t('linkMissing') : t('linkExpired')}
                    </p>

                    <Link href="/forgot" className="text-center text-sm underline underline-offset-4">
                        {t('forgotTitle')}
                    </Link>
                </div>
            )}
        </main>
    );
}
