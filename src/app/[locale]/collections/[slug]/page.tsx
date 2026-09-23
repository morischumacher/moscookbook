import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { collectionBySlug } from '@/lib/collectionQuery';
import { publicOnly } from '@/lib/collectionVisibility';
import CollectionIntro from '@/components/collection/CollectionIntro';
import CollectionGrid from '@/components/collection/CollectionGrid';
import ShareButton from '@/components/share/ShareButton';
import AddToShopping from '@/components/shopping/AddToShopping';
import { getCurrentUser } from '@/lib/auth';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import { pageContainer, pageTop } from '@/lib/ui';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import { formatDate } from '@/lib/formatDate';

export default async function CollectionPage({
    params,
}: {
    params: Promise<{ locale: string; slug: string }>;
}) {
    const { locale, slug } = await params;
    const [collection, user] = await Promise.all([collectionBySlug(slug), getCurrentUser()]);

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

    const [t, tBlog, tMenus] = await Promise.all([getTranslations('Collections'), getTranslations('Blog'), getTranslations('Menus')]);

    // Entries written about this collection, for people with an account — the
    // same "From the blog" a recipe page has, and the other end of an entry's
    // "In this post". Published ones only, unless an admin is looking.
    const posts = user
        ? await prisma.post.findMany({
              where: {
                  collections: { some: { collectionId: collection.id } },
                  ...(user.admin ? {} : { publishedAt: { not: null } }),
              },
              orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
              take: 20,
              select: { id: true, title: true, slug: true, publishedAt: true, createdAt: true },
          })
        : [];

    return (
        <main className={`${pageContainer} pb-32`}>
            <div className={pageTop}>
                <CollectionIntro
                    title={collection.title}
                    description={collection.description}
                    // Its own picture, or the first recipe this viewer may
                    // see — a stranger is never shown a private recipe's.
                    imageUrl={shown.imageUrl ?? shown.recipes[0]?.imageUrl ?? null}
                    meta={
                        <>
                            {t('recipeCount', { count: shown.recipes.length })}
                            {shown.hidden > 0 && <> · {t('hiddenCount', { count: shown.hidden })}</>}
                        </>
                    }
                />
            </div>

            <div className="mt-8">
                <CollectionGrid recipes={shown.recipes} linkTo="recipe" />
            </div>

            {posts.length > 0 && (
                <section className="mt-12 border-t border-line pt-6">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
                        {tBlog('notesTitle')}
                    </h2>
                    <ul className="flex flex-col gap-2">
                        {posts.map((post) => (
                            <li key={post.id}>
                                <Link href={`/blog/${post.slug}`} className="font-medium underline underline-offset-4">
                                    {post.title}
                                </Link>
                                <span className="ml-2 text-sm text-faint">
                                    {formatDate(post.publishedAt ?? post.createdAt, locale, 'short')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/*
                Share is offered to everybody who can read the page; what it
                does differs. An admin gets the three stages, and anybody else
                gets the address they are already looking at — see ShareButton.
            */}
            <div className="mt-10 flex flex-wrap items-center gap-6">
                {/* Every recipe on the list at once — a menu is shopped for
                    in one go. For people with an account, whose list it is. */}
                {user && shown.recipes.length > 0 && <AddToShopping collectionId={collection.id} />}

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

                {/* The collection as an evening: its recipes sorted into
                    courses, for a card to print or send. */}
                {user?.admin && shown.recipes.length > 0 && (
                    <Link
                        href={`/admin/menus/new?collection=${collection.id}`}
                        className="text-sm underline underline-offset-4"
                    >
                        {tMenus('fromCollection')}
                    </Link>
                )}
            </div>
        </main>
    );
}
