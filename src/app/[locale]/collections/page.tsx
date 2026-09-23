import Image from 'next/image';
import { excerptOf } from '@/lib/postSchema';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { pageContainer, pageTop, pageHeading, buttonPrimarySmall } from '@/lib/ui';
import { getCurrentUser } from '@/lib/auth';
import { otherLanguageExamples } from '@/lib/examples';
import { titled } from '@/lib/metaTitle';

export const generateMetadata = titled('Collections', 'title');

/**
 * Every collection.
 *
 * A list rather than a grid: a collection has no picture of its own, and
 * borrowing its first recipe's would make six collections look like six
 * recipes. What a reader is choosing between here is names.
 */
export default async function CollectionsPage() {
    const t = await getTranslations('Collections');
    const locale = await getLocale();
    const user = await getCurrentUser();

    const collections: {
        id: number;
        title: string;
        slug: string;
        description: string | null;
        imageUrl: string | null;
        _count: { recipes: number };
        recipes: { recipe: { images: { url: string }[] } }[];
    }[] = await prisma.collection.findMany({
        where: { slug: { notIn: otherLanguageExamples(locale).collections } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            imageUrl: true,
            _count: { select: { recipes: true } },
            // The first recipe's picture stands in for a collection without
            // its own. Drafts are skipped, as everywhere a collection is shown.
            recipes: {
                where: { recipe: { isDraft: false, onlyMe: false } },
                orderBy: { position: 'asc' },
                take: 1,
                select: { recipe: { select: { images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } } } },
            },
        },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <header className={`flex flex-wrap items-baseline justify-between gap-4 ${pageTop} ${pageHeading}`}>
                {/* The same size as every other page title: a bare h1 took the
                    global display style instead, and was twice as large. */}
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>

                {user?.admin && (
                    <span className="text-base font-normal tracking-normal">
                        <Link href="/admin/collections/new" className={buttonPrimarySmall}>
                            {t('createNew')}
                        </Link>
                    </span>
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
                                className="flex items-center gap-4 py-5 transition-opacity hover:opacity-70"
                            >
                                <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                                    {(collection.imageUrl ?? collection.recipes[0]?.recipe.images[0]?.url) && (
                                        <Image
                                            src={(collection.imageUrl ?? collection.recipes[0]?.recipe.images[0]?.url)!}
                                            alt=""
                                            fill
                                            sizes="80px"
                                            className="object-cover"
                                        />
                                    )}
                                </span>
                                <span className="min-w-0">
                                    <h2 className="text-xl font-bold leading-tight">{collection.title}</h2>

                                    {/* The description can be pages long now;
                                        a list shows its opening words. */}
                                    {collection.description && (
                                        <p className="mt-1 font-serif text-muted">{excerptOf(collection.description, 140)}</p>
                                    )}

                                    <p className="mt-2 text-xs uppercase tracking-widest text-faint">
                                        {t('recipeCount', { count: collection._count.recipes })}
                                    </p>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}
