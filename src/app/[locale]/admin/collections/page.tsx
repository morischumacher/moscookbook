import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { buttonPrimarySmall, pageContainer } from '@/lib/ui';
import PageHeader from '@/components/admin/PageHeader';
import ExampleButton from '@/components/admin/ExampleButton';
import { EXAMPLE_COLLECTION_SLUG } from '@/lib/examples';

/**
 * Every collection, to open and change — the admin's list, like Blog's.
 *
 * The admin bar used to link straight to "New collection", so there was no
 * way from the admin area to an existing one except through the public page,
 * and the bar mixed a verb in among nouns ("New collection" beside "Blog
 * posts"). It is "Collections" now, and "New collection" is the button here.
 */
export default async function AdminCollections() {
    const t = await getTranslations('Collections');

    const collections = await prisma.collection.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            slug: true,
            isPublic: true,
            imageUrl: true,
            _count: { select: { recipes: true } },
            recipes: {
                orderBy: { position: 'asc' },
                take: 1,
                select: { recipe: { select: { images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } } } },
            },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <PageHeader title={t('adminTitle')}>
                <Link href="/admin/collections/new" className={buttonPrimarySmall}>
                    {t('createNew')}
                </Link>
            </PageHeader>

            {collections.length === 0 ? (
                <div className="py-16 text-center">
                    <p className="text-muted">{t('adminEmpty')}</p>
                    <ExampleButton kind="collection" />
                </div>
            ) : (
                <ul className="divide-y divide-line">
                    {collections.map((collection) => {
                        const picture = collection.imageUrl ?? collection.recipes[0]?.recipe.images[0]?.url ?? null;
                        return (
                            <li key={collection.id} className="flex items-center gap-4 py-4">
                                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface">
                                    {picture && <Image src={picture} alt="" fill sizes="56px" className="object-cover" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/admin/collections/${collection.id}`}
                                        className="text-lg font-bold tracking-tight underline-offset-4 hover:underline"
                                    >
                                        {collection.title}
                                    </Link>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted">
                                        {t('recipeCount', { count: collection._count.recipes })} •{' '}
                                        {collection.isPublic ? t('isPublic') : t('isPrivate')}
                                    </p>
                                </div>
                                <Link
                                    href={`/collections/${collection.slug}`}
                                    className="text-sm text-muted underline underline-offset-4"
                                >
                                    {t('view')}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}

            {collections.length > 0 &&
                !collections.some((collection) =>
                    (Object.values(EXAMPLE_COLLECTION_SLUG) as string[]).includes(collection.slug)
                ) && (
                    <div className="border-t border-line pt-2">
                        <ExampleButton kind="collection" />
                    </div>
                )}
        </main>
    );
}
