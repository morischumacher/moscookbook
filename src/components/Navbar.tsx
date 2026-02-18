import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import styles from './Navbar.module.css';

export default function Navbar({ locale }: { locale: string }) {
    const t = useTranslations('Navigation');
    const otherLocale = locale === 'en' ? 'de' : 'en';

    return (
        <nav className={styles.navbar}>
            <div className={`container ${styles.container}`}>
                <Link href="/" className={styles.logo}>
                    Mo's Cookbook
                </Link>

                <div className={styles.links}>
                    <Link href="/" className={styles.link}>{t('home')}</Link>
                    <Link href="/login" className={styles.link}>{t('login')}</Link>
                    <Link href="/admin" className={styles.link}>{t('admin')}</Link>
                    <Link href="/" locale={otherLocale} className={styles.langToggle}>
                        {otherLocale.toUpperCase()}
                    </Link>
                </div>
            </div>
        </nav>
    );
}
