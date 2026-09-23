import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { itemsOf, listFor, listOf, listsSharedWith } from '@/lib/shoppingDb';
import { Link } from '@/i18n/routing';
import ShoppingListView from '@/components/shopping/ShoppingListView';
import { pageContainer, pageHeading, pageTop } from '@/lib/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Shopping' });
    return { title: `${t('title')} — mo'scookbook`, robots: { index: false, follow: false } };
}

/**
 * The signed-in person's shopping list, and beside it any list somebody else
 * shared with them (`?list=<id>`). See components/shopping/ShoppingListView.
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
    // A list no longer shared (or never) opens one's own rather than an error.
    const access = (await listFor(user.id, requested)) ?? (await listFor(user.id, null))!;
    const [t, own, shared, items] = await Promise.all([
        getTranslations('Shopping'),
        listOf(user.id),
        listsSharedWith(user.id),
        itemsOf(access.id),
    ]);
    const settings = access.owner
        ? await prisma.shoppingList.findUnique({ where: { id: own.id }, select: { shareToken: true, shareCanAdd: true } })
        : null;
    const current = shared.find((list) => list.id === access.id);

    const tab = (active: boolean) =>
        `shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
            active ? 'border-ink bg-ink text-page' : 'border-control text-muted hover:border-ink hover:text-ink'
        }`;

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-6`}>{t('title')}</h1>

            {shared.length > 0 && (
                <nav aria-label={t('listsLabel')} className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
                    <Link href="/shopping" className={tab(access.owner)} aria-current={access.owner ? 'page' : undefined}>
                        {t('myList')}
                    </Link>
                    {shared.map((list) => (
                        <Link
                            key={list.id}
                            href={`/shopping?list=${list.id}`}
                            className={tab(list.id === access.id)}
                            aria-current={list.id === access.id ? 'page' : undefined}
                        >
                            {t('sharedBy', { name: list.owner })}
                        </Link>
                    ))}
                </nav>
            )}

            <ShoppingListView
                key={access.id}
                initial={items}
                mode={
                    access.owner
                        ? { kind: 'own', shareToken: settings?.shareToken ?? null, canAdd: settings?.shareCanAdd ?? true }
                        : { kind: 'member', listId: access.id, ownerName: current?.owner ?? '' }
                }
            />
        </main>
    );
}
