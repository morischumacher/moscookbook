import { getCurrentUser } from '@/lib/auth';
import MobileNavbar from './MobileNavbar';

export default async function Navbar({ locale }: { locale: string }) {
    const user = await getCurrentUser();
    const otherLocale = locale === 'en' ? 'de' : 'en';

    return <MobileNavbar user={user} otherLocale={otherLocale} />;
}
