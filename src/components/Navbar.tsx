import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import MobileNavbar from './MobileNavbar';

interface SessionData {
    user?: {
        id: number;
        email: string;
        name: string;
        admin: boolean;
    };
}

export default async function Navbar({ locale }: { locale: string }) {
    const t = await getTranslations('Navigation');
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const otherLocale = locale === 'en' ? 'de' : 'en';

    return (
        <MobileNavbar
            tHome={t('home')}
            tLogin={t('login')}
            tAdmin={t('admin')}
            user={session.user || null}
            locale={locale}
            otherLocale={otherLocale}
        />
    );
}
