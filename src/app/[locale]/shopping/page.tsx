import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { activeList, householdOf, invitationsFor, itemsOf } from '@/lib/shoppingDb';
import ShoppingListView from '@/components/shopping/ShoppingListView';
import ShoppingInvitations from '@/components/shopping/ShoppingInvitations';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Shopping' });
    return { title: `${t('title')} — mo'scookbook`, robots: { index: false, follow: false } };
}

/**
 * The list the signed-in person shops on: their own, or the household's they
 * joined. See components/shopping/ShoppingListView.
 */
export default async function ShoppingPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const user = await getCurrentUser();
    if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/shopping`)}`);

    const list = await activeList(user.id);
    const [t, items, household, invitations, settings] = await Promise.all([
        getTranslations('Shopping'),
        itemsOf(list.id),
        householdOf(list.id),
        invitationsFor(user.id),
        prisma.shoppingList.findUnique({ where: { id: list.id }, select: { shareToken: true, shareCanAdd: true } }),
    ]);

    // Everybody on the list but the person looking at it.
    const others = household ? [household.owner, ...household.members].filter((person) => person.id !== user.id).map((person) => person.name) : [];

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} ${others.length ? 'mb-2' : 'mb-6'}`}>{t('title')}</h1>
            {others.length > 0 && <p className="mb-6 text-sm text-muted">{t('sharedWith', { names: others.join(', ') })}</p>}

            {invitations.length > 0 && <ShoppingInvitations invitations={invitations} />}

            {/* Keyed by the list: joining or leaving swaps it for another. */}
            <ShoppingListView
                key={list.id}
                initial={items}
                mode={{ kind: 'account', owner: list.owner, shareToken: settings?.shareToken ?? null, canAdd: settings?.shareCanAdd ?? true }}
            />
        </main>
    );
}
