import { getCurrentUser, currentProfile } from '@/lib/auth';
import MobileNavbar from './MobileNavbar';

export default async function Navbar({ locale }: { locale: string }) {
    const user = await getCurrentUser();
    // The picture as it is now rather than as it was at sign-in, so changing
    // it on the account page changes it in the corner of every page.
    const profile = user ? await currentProfile() : null;
    const otherLocale = locale === 'en' ? 'de' : 'en';

    return <MobileNavbar user={user} profile={profile} otherLocale={otherLocale} />;
}
