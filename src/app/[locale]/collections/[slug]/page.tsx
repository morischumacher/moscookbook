import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { collectionBySlug } from '@/lib/collectionQuery';
import { publicOnly } from '@/lib/collectionVisibility';
import CollectionGrid from '@/components/collection/CollectionGrid';
import ShareButton from '@/components/share/ShareButton';
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
    const user = await getCurrentUser();

    /*
     * One of the three pages whose access the proxy does not decide.
     *
     * accessRules lets `/collections/<slug>` through because only the row
     * knows whether it is public, so the check lives here and has to be the
     * first thing that happens. Forget it and every collection — which is a
     * list of recipes, some of them private — is on the open web.
     *
     * A missing collection and a private one look identical to somebody with
     * no account, deliberately, for the same reason as on a recipe: otherwise
     * a word list finds out what exists.
     */
    if (!user && !collection?.isPublic) {
        const next = encodeURIComponent(`/${locale}/collections/${slug}`);
        redirect(`/${locale}/login?next=${next}`);
    }

    if (!collection) notFound();

    // A stranger sees the recipes that are public in their own right. See
    // `publicOnly`: publishing a menu must not publish what is on it.
    const shown = user ? { ...collection, hidden: 0 } : publicOnly(collection);

    const t = await getTranslations('Collections');

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
                    {t('recipeCount', { count: shown.recipes.length })}
                    {shown.hidden > 0 && <> · {t('hiddenCount', { count: shown.hidden })}</>}
                </p>
            </div>

            <div className="mt-8">
                <CollectionGrid recipes={shown.recipes} linkTo="recipe" />
            </div>

            {/*
                Share is offered to everybody who can read the page; what it
                does differs. An admin gets the three stages, and anybody else
                gets the address they are already looking at — see ShareButton.
            */}
            <div className="mt-10 flex flex-wrap items-center gap-6">
                <ShareButton
                    id={collection.id}
                    kind="collection"
                    title={collection.title}
                    locale={locale}
                    isPublic={collection.isPublic}
                    linkUrl={
                        collection.shareToken
                            ? shareUrl(getSiteUrl(), locale, collection.shareToken, 'collection')
                            : null
                    }
                    ownUrl={`${getSiteUrl()}/${locale}/collections/${collection.slug}`}
                    mayChange={Boolean(user?.admin)}
                    className="text-sm text-muted underline underline-offset-4 hover:text-ink"
                />

                {user?.admin && (
                    <Link
                        href={`/admin/collections/${collection.id}`}
                        className="text-sm underline underline-offset-4"
                    >
                        {t('edit')}
                    </Link>
                )}
            </div>
        </main>
    );
}
