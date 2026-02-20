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
                    {!session.user ? (
                        <Link href="/login" className={styles.link}>{t('login')}</Link>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-primary)' }}>
                                Hello {session.user.name}
                            </span>
                            {session.user.admin && (
                                <div className={styles.adminLinks} style={{ display: 'flex', gap: 'var(--space-md)' }}>
                                    <Link href="/admin" className={styles.link}>{t('admin')}</Link>
                                    <Link href="/admin/users" className={styles.link}>Users</Link>
                                </div>
                            )}
                            <LogoutButton className={styles.link} />
                        </div>
                    )}
                    <Link href="/" locale={otherLocale} className={styles.langToggle}>
                        {otherLocale.toUpperCase()}
                    </Link>
                </div>
            </div>
        </nav>
    );
}
