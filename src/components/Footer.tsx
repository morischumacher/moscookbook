import { getTranslations } from 'next-intl/server';
import styles from './Footer.module.css';

export default async function Footer() {
    const t = await getTranslations('Site');

    return (
        <footer className={styles.footer}>
            <div className="container">
                <p>
                    &copy; {new Date().getFullYear()} {t('title')}. {t('rightsReserved')}
                </p>
            </div>
        </footer>
    );
}
