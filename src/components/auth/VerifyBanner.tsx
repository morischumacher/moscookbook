import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
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
 * next sign-in.
 */
export default async function VerifyBanner() {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) return null;

    const user = await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt) return null;

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
