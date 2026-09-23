import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { itemsOf } from '@/lib/shoppingDb';
import ShoppingListView from '@/components/shopping/ShoppingListView';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A shopping list somebody was sent. No account needed: the link is the
 * permission, it opens this one list, and it can tick — and add, if the
 * owner allows it — but not delete.
 */
export default async function SharedShoppingPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

    const list = await prisma.shoppingList.findUnique({
        where: { shareToken: token },
        select: { id: true, name: true, shareCanAdd: true, user: { select: { firstName: true, name: true } } },
    });
    if (!list) notFound();

    const [t, items] = await Promise.all([getTranslations('Shopping'), itemsOf(list.id)]);

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-2`}>{list.name ?? t('title')}</h1>
            <p className="mb-6 text-sm text-muted">{t('sharedBy', { name: list.user.firstName || list.user.name })}</p>
            <ShoppingListView initial={items} mode={{ kind: 'shared', token, canAdd: list.shareCanAdd }} />
        </main>
    );
}
