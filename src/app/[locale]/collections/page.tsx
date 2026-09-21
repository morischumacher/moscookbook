import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { pageContainer, pageTop, pageHeading, buttonPrimarySmall } from '@/lib/ui';
import { getCurrentUser } from '@/lib/auth';

/**
 * Every collection.
 *
 * A list rather than a grid: a collection has no picture of its own, and
 * borrowing its first recipe's would make six collections look like six
 * recipes. What a reader is choosing between here is names.
 */
export default async function CollectionsPage() {
    const t = await getTranslations('Collections');
    const user = await getCurrentUser();

    const collections: {
        id: number;
        title: string;
        slug: string;
        description: string | null;
        _count: { recipes: number };
    }[] = await prisma.collection.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            _count: { select: { recipes: true } },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <header className={`flex flex-wrap items-baseline justify-between gap-4 ${pageTop} ${pageHeading}`}>
                <h1>{t('title')}</h1>

                {user?.admin && (
                    <Link href="/admin/collections/new" className={buttonPrimarySmall}>
                        {t('createNew')}
                    </Link>
                )}
            </header>

            <p className="mt-6 font-serif text-lg leading-relaxed text-muted">{t('intro')}</p>

            {collections.length === 0 ? (
                <p className="py-20 text-center text-muted">{t('none')}</p>
            ) : (
                <ul className="mt-8 divide-y divide-line">
                    {collections.map((collection) => (
                        <li key={collection.id}>
                            <Link
                                href={`/collections/${collection.slug}`}
                                className="block py-5 transition-opacity hover:opacity-70"
                            >
                                <h2 className="text-xl font-bold leading-tight">{collection.title}</h2>

                                {collection.description && (
                                    <p className="mt-1 font-serif text-muted">{collection.description}</p>
                                )}

                                <p className="mt-2 text-xs uppercase tracking-widest text-faint">
                                    {t('recipeCount', { count: collection._count.recipes })}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
