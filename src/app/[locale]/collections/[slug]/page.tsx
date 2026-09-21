import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { collectionBySlug } from '@/lib/collectionQuery';
import CollectionGrid from '@/components/collection/CollectionGrid';
import ShareLink from '@/components/recipe/ShareLink';
import { getCurrentUser } from '@/lib/auth';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import { pageContainer, pageTop } from '@/lib/ui';
import { Link } from '@/i18n/routing';

export default async function CollectionPage({
    params,
}: {
    params: Promise<{ locale: string; slug: string }>;
}) {
    const { locale, slug } = await params;
    const collection = await collectionBySlug(slug);

    if (!collection) notFound();

    const t = await getTranslations('Collections');
    const user = await getCurrentUser();

    return (
        <main className={`${pageContainer} pb-32`}>
            <div className={pageTop}>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {collection.title}
                </h1>

                {collection.description && (
                    <p className="mt-3 font-serif text-lg leading-relaxed text-muted">
                        {collection.description}
                    </p>
                )}

                <p className="mt-3 text-xs uppercase tracking-widest text-faint">
                    {t('recipeCount', { count: collection.recipes.length })}
                </p>
            </div>

            <div className="mt-8">
                <CollectionGrid recipes={collection.recipes} linkTo="recipe" />
            </div>

            {user?.admin && (
                <div className="mt-10 flex flex-col gap-6">
                    <ShareLink
                        id={collection.id}
                        kind="collection"
                        initialUrl={
                            collection.shareToken
                                ? shareUrl(getSiteUrl(), locale, collection.shareToken, 'collection')
                                : null
                        }
                        locale={locale}
                    />

                    <Link
                        href={`/admin/collections/${collection.id}`}
                        className="self-start text-sm underline underline-offset-4"
                    >
                        {t('edit')}
                    </Link>
                </div>
            )}
        </main>
    );
}
