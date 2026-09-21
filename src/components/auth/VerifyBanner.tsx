import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import { isEmailVerified } from '@/lib/verifiedFlag';
import ResendVerification from './ResendVerification';

/**
 * A reminder for someone whose address is not confirmed yet.
 *
 * Not a wall. An unconfirmed address still gets the whole cookbook: this is an
 * invite-only site where somebody already vouched for the person, and locking
 * them out because a mail went to spam would punish them for something that is
 * not theirs to fix. What confirmation buys is the ability to reset their own
 * password later, and that is what the text says.
 *
 * The flag is read from the database rather than the session cookie, so that
 * confirming makes the banner disappear on the next render instead of at the
 * next sign-in. That read is cached per person and cleared by the route that
 * does the confirming — it used to be a round trip on every page render for
 * every signed-in person, for the whole life of an account, to learn something
 * that changes once. See lib/verifiedFlag.
 */
export default async function VerifyBanner() {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) return null;

    if (await isEmailVerified(sessionUser.id)) return null;

    const t = await getTranslations('Auth');

    return (
        // The neutral surface rather than the danger one: nothing has gone
        // wrong, and dressing a reminder up as an error trains people to
        // ignore the colour that does mean something.
        <div className="print:hidden border-b border-line bg-surface px-4 py-3 text-center text-sm text-ink">
            {t('verifyBanner')} <ResendVerification />
        </div>
    );
}
