import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { householdOf, invitationsFor, itemsOf, listFor, listsOf } from '@/lib/shoppingDb';
import ShoppingListView from '@/components/shopping/ShoppingListView';
import ShoppingInvitations from '@/components/shopping/ShoppingInvitations';
import ShoppingLists from '@/components/shopping/ShoppingLists';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Shopping' });
    return { title: `${t('title')} — mo'scookbook`, robots: { index: false, follow: false } };
}

/**
 * The signed-in person's shopping lists: the main one, their named ones and
 * the ones they joined, one open at a time (`?list=<id>`, the main list
 * without it). See components/shopping/ShoppingListView.
 */
export default async function ShoppingPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ list?: string | string[] }>;
}) {
    const [{ locale }, query] = await Promise.all([params, searchParams]);
    const user = await getCurrentUser();
    if (!user) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/shopping`)}`);

    const requested = typeof query.list === 'string' ? query.list : null;
    // A list that was deleted or left opens the main list rather than an error.
    const list = (await listFor(user.id, requested)) ?? (await listFor(user.id, null))!;
    const [t, lists, items, household, invitations, settings] = await Promise.all([
        getTranslations('Shopping'),
        listsOf(user.id),
        itemsOf(list.id),
        householdOf(list.id),
        invitationsFor(user.id),
        prisma.shoppingList.findUnique({ where: { id: list.id }, select: { shareToken: true, shareCanAdd: true } }),
    ]);

    // Everybody on this list but the person looking at it.
    const others = household ? [household.owner, ...household.members].filter((person) => person.id !== user.id).map((person) => person.name) : [];

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-6`}>{t('title')}</h1>

            {invitations.length > 0 && <ShoppingInvitations invitations={invitations} />}

            <ShoppingLists lists={lists} current={list.id} />

            {others.length > 0 && <p className="-mt-3 mb-6 text-sm text-muted">{t('sharedWith', { names: others.join(', ') })}</p>}

            {/* Keyed by the list: switching lists starts afresh. */}
            <ShoppingListView
                key={list.id}
                initial={items}
                mode={{
                    kind: 'account',
                    listId: list.id,
                    name: list.name,
                    owner: list.owner,
                    // The link is the owner's to hand out: not even in a member's page data.
                    shareToken: list.owner ? (settings?.shareToken ?? null) : null,
                    canAdd: settings?.shareCanAdd ?? true,
                }}
            />
        </main>
    );
}
