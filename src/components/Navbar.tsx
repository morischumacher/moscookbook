import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import Image from 'next/image';
import LogoutButton from './LogoutButton';
import styles from './Navbar.module.css';

interface SessionData {
    user?: {
        id: number;
        email: string;
        admin: boolean;
    };
}

export default async function Navbar({ locale }: { locale: string }) {
    const t = await getTranslations('Navigation');
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const otherLocale = locale === 'en' ? 'de' : 'en';

    return (
        <nav className={styles.navbar}>
            <div className={`container ${styles.container}`}>
                <Link href="/" className={styles.logo}>
                    <Image
                        src="/logo.png"
                        alt="Mo's Cookbook Logo"
                        width={240}
                        height={40}
                        className={styles.logoImage}
                        priority
                    />
                </Link>

                <div className={styles.links}>
                    <Link href="/" className={styles.link}>{t('home')}</Link>
                    {!session.user?.admin && (
                        <Link href="/login" className={styles.link}>{t('login')}</Link>
                    )}
                    {session.user?.admin && (
                        <>
                            <Link href="/admin" className={styles.link}>{t('admin')}</Link>
                            <LogoutButton className={styles.link} />
                        </>
                    )}
                    <Link href="/" locale={otherLocale} className={styles.langToggle}>
                        {otherLocale.toUpperCase()}
                    </Link>
                </div>
            </div>
        </nav>
    );
}
