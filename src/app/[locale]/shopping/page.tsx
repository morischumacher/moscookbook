import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import { itemsOf, listOf } from '@/lib/shoppingDb';
import ShoppingListView from '@/components/shopping/ShoppingListView';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Shopping' });
    return { title: `${t('title')} — mo'scookbook`, robots: { index: false, follow: false } };
}

/** The signed-in person's shopping list. See components/shopping/ShoppingListView. */
export default async function ShoppingPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const user = await getCurrentUser();
    if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/shopping`)}`);

    const [t, list] = await Promise.all([getTranslations('Shopping'), listOf(user.id)]);
    const items = await itemsOf(list.id);

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-6`}>{t('title')}</h1>
            <ShoppingListView initial={items} mode={{ kind: 'own', shareToken: list.shareToken }} />
        </main>
    );
}
