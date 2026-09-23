import { getCurrentUser, currentProfile } from '@/lib/auth';
import prisma from '@/lib/prisma';
import MobileNavbar from './MobileNavbar';

export default async function Navbar({ locale }: { locale: string }) {
    const user = await getCurrentUser();
    // The picture as it is now rather than as it was at sign-in, so changing
    // it on the account page changes it in the corner of every page.
    const [profile, invitations] = user
        ? await Promise.all([currentProfile(), prisma.shoppingListMember.count({ where: { userId: user.id, acceptedAt: null } })])
        : [null, 0];
    const otherLocale = locale === 'en' ? 'de' : 'en';

    return <MobileNavbar user={user} profile={profile} otherLocale={otherLocale} invitations={invitations} />;
}
