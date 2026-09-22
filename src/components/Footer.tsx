import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import styles from './Footer.module.css';

export default async function Footer() {
    const t = await getTranslations('Site');
    const tLegal = await getTranslations('Legal');

    return (
        <footer className={styles.footer}>
            <div className="container mx-auto px-4 md:px-8">
                <p>
                    &copy; {new Date().getFullYear()} {t('title')}. {t('rightsReserved')}
                </p>

                {/* On every page, including the ones reachable without an
                    account — which is the only reason they exist. A disclosure
                    linked only from behind a sign-in form is not a
                    disclosure. */}
                <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    <Link href="/imprint" className="underline underline-offset-4 hover:opacity-70">
                        {tLegal('imprintTitle')}
                    </Link>
                    <Link href="/privacy" className="underline underline-offset-4 hover:opacity-70">
                        {tLegal('privacyTitle')}
                    </Link>
                </p>
            </div>
        </footer>
    );
}
