import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { menuBy } from '@/lib/menuQuery';
import MenuCard from '@/components/menu/MenuCard';
import PrintButton from '@/components/menu/PrintButton';
import { pageContainer } from '@/lib/ui';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A menu card a guest was sent. No account: the link is the permission, and
 * it shows the card — dish names, never the recipes behind them.
 */
export default async function SharedMenuPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
    const { locale, token } = await params;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

    const [menu, t] = await Promise.all([menuBy({ shareToken: token }), getTranslations('Menus')]);
    if (!menu) notFound();

    return (
        <main className={`${pageContainer} pb-24 pt-6 sm:pt-10 print:p-0`}>
            <div className="-mx-4 sm:mx-0 print:mx-0">
                <MenuCard menu={menu} locale={locale} />
            </div>
            <div className="mt-8 flex justify-center print:hidden">
                <PrintButton label={t('print')} />
            </div>
        </main>
    );
}
