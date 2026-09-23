import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import RegisterForm from '@/components/auth/RegisterForm';
import { inviteLinkState, inviteName } from '@/lib/linkState';

/**
 * Making an account, which needs an invitation.
 *
 * **The invitation is checked before the form is drawn**, for the same reason
 * the reset page checks its link — and here the cost of getting it wrong was
 * higher. The page used to ask only whether an `invite` parameter was
 * *present*. Anything in it was accepted as far as the form was concerned, so
 * somebody opening a spent invitation filled in a first name, a last name, an
 * address and a password, pressed the button, and only then learned that the
 * invitation had been used — often by themselves, weeks earlier, which is
 * exactly why the mail was still in their inbox.
 *
 * Four fields of typing to be told something that was knowable before the page
 * rendered.
 *
 * Only a read; the invitation is claimed by the conditional UPDATE in the
 * registration route, which is what makes two people opening one link produce
 * one account.
 */
export default async function RegisterPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const t = await getTranslations('Auth');

    const raw = (await searchParams).invite;
    const invite = typeof raw === 'string' ? raw : undefined;

    const [state, promised] = await Promise.all([inviteLinkState(invite), inviteName(invite)]);

    return (
        <main className="container mx-auto max-w-sm px-4 pb-32 pt-16 sm:pt-24">
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight">{t('registerTitle')}</h1>
            <p className="mb-8 font-serif text-muted">{t('registerIntro')}</p>

            {state === 'valid' ? (
                <RegisterForm invite={invite as string} firstName={promised.firstName} lastName={promised.lastName} />
            ) : (
                <div className="rounded-lg border border-line p-4">
                    {/* Three different situations, and the difference matters:
                        arriving with no invitation at all is somebody who needs
                        to be asked for one, while a used or expired invitation
                        is somebody who had one and needs another. Telling them
                        apart is the difference between "ask Mo" and "look for a
                        newer mail", and only one of those is worth doing. */}
                    <p className="text-muted">
                        {state === 'missing' || state === 'unknown'
                            ? t('inviteRequired')
                            : state === 'used'
                              ? t('inviteUsed')
                              : t('inviteExpired')}
                    </p>

                    <Link href="/login" className="mt-4 inline-block text-sm underline underline-offset-4">
                        {t('loginLink')}
                    </Link>
                </div>
            )}
        </main>
    );
}
