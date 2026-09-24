import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import RecipeArticle, { recipeInclude, type RecipeRow } from '@/components/recipe/RecipeArticle';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import FinishDraft from '@/components/recipe/FinishDraft';
import { pageContainer, pageTop } from '@/lib/ui';
import { getTranslations } from 'next-intl/server';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import { similarRecipes } from '@/lib/similarRecipes';
import { inLanguage } from '@/lib/recipeTranslation';
import { maysee } from '@/lib/recipeVisibility';
import { loadRatingSummary } from '@/lib/ratingSummary';

// generateMetadata and the page itself both need the recipe; cache() makes
// that a single database round trip per request instead of two. The rating
// count and total are asked for alongside, by slug, so they cost no extra
// wait: an aggregate cannot ride inside the include (see RecipeRow.rating).
const loadRecipe = cache(async (slug: string): Promise<RecipeRow | null> => {
    const [row, rating] = await Promise.all([
        prisma.recipe.findUnique({ where: { slug }, include: recipeInclude }),
        loadRatingSummary({ slug }),
    ]);
    return row && { ...row, rating };
});

/**
 * What a crawler or a link preview is told.
 *
 * A private recipe gets a title for the browser tab and nothing else: neither
 * can get past the login, and `index: false` keeps the address out of a search
 * result that would only ever lead to a sign-in form.
 *
 * A **public** one is a page on the web like any other, so it gets the card:
 * the title, the description, the picture. That is the difference between
 * publishing a recipe and handing somebody a secret link — a share token says
 * "do not index me" precisely because it is a secret, and this is not.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const found = await loadRecipe(slug);
    // The title and description in the reader's language, when translated.
    const recipe = found && inLanguage(found, locale);

    const t = await getTranslations({ locale, namespace: 'Recipe' });

    if (!recipe) return { title: t('notFound') };
    // Not even its title in the tab for somebody it is hidden from.
    if (recipe.onlyMe && !(await getCurrentUser())?.admin) return { title: t('notFound') };

    const title = `${recipe.title} — mo'scookbook`;

    if (!recipe.isPublic) {
        // Not its title for a visitor it will be refused to: the metadata
        // streams before the page's redirect to the login.
        const user = await getCurrentUser();
        if (!user) return { title: t('notFound'), robots: { index: false, follow: false } };
        return { title, robots: { index: false, follow: false } };
    }

    const url = `${getSiteUrl()}/${locale}/recipe/${recipe.slug}`;
    const image = recipe.images[0]?.url;

    return {
        title,
        description: recipe.description ?? undefined,
        // Both languages name each other, as the sitemap already does, so a
        // search engine shows German readers the German page.
        alternates: {
            canonical: url,
            languages: {
                de: `${getSiteUrl()}/de/recipe/${recipe.slug}`,
                en: `${getSiteUrl()}/en/recipe/${recipe.slug}`,
                'x-default': `${getSiteUrl()}/de/recipe/${recipe.slug}`,
            },
        },
        robots: { index: true, follow: true },
        openGraph: {
            type: 'article',
            title: recipe.title,
            description: recipe.description ?? undefined,
            url,
            images: image ? [image] : undefined,
        },
    };
}

export default async function RecipePage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    const { slug, locale } = await params;

    // Side by side: neither needs the other, and every round trip saved here is
    // one the page no longer waits for before it can start streaming.
    const [recipe, user] = await Promise.all([loadRecipe(slug), getCurrentUser()]);

    /*
     * The one page whose access the proxy does not decide.
     *
     * accessRules lets `/recipe/<slug>` through because only the row knows
     * whether it is public, so the check lives here and has to be the first
     * thing that happens.
     *
     * A missing recipe and a private one look identical to somebody with no
     * account, and that is deliberate. Answering 404 for one and "sign in" for
     * the other would let anybody with a word list discover which recipes
     * exist, one guess at a time, without ever signing in. Both go to the
     * login form, carrying where they were headed, so following a link and
     * signing in still lands on the recipe.
     */
    if (!user && (!recipe?.isPublic || recipe.isDraft)) {
        const next = encodeURIComponent(`/${locale}/recipe/${slug}`);
        redirect(`/${locale}/login?next=${next}`);
    }

    // "Only me": to anybody but an admin it does not exist (lib/recipeVisibility).
    if (!recipe || !maysee(recipe, user)) notFound();

    /*
     * Everything below the recipe itself is for people with an account.
     *
     * A public recipe publishes the *recipe*: what is in it, how it is made,
     * what it looks like, how it was rated on average. It does not publish the
     * household that cooks it. The written notes, the cooking entries with
     * their names, dates and photographs, and the other recipes in the book
     * all stay behind the login, because a name and a face on the open web do
     * not come back and nobody agreed to that by writing down a recipe.
     *
     * Queried conditionally rather than filtered later: the cheapest way to
     * not leak something is not to fetch it. And queried together — these
     * used to run one after another, a round trip each where one will do.
     */
    const isMember = Boolean(user);

    const [cookieStore, favorite, ownRating, notes, cooked, similar] = await Promise.all([
        cookies(),
        user
            ? prisma.favorite.findUnique({
                  where: { userId_recipeId: { userId: user.id, recipeId: recipe.id } },
                  select: { userId: true },
              })
            : null,
        // The viewer's own rating, the one row of them the page needs.
        user
            ? prisma.rating.findUnique({
                  where: { userId_recipeId: { userId: user.id, recipeId: recipe.id } },
                  select: { value: true },
              })
            : null,
        // Oldest first: a cooking log is read as a sequence. Drafts only for
        // an admin, same rule as the blog index.
        isMember
            ? prisma.post.findMany({
                  where: {
                      recipes: { some: { recipeId: recipe.id } },
                      ...(user?.admin ? {} : { publishedAt: { not: null } }),
                  },
                  orderBy: [{ publishedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
                  take: 50,
                  select: {
                      id: true,
                      title: true,
                      slug: true,
                      body: true,
                      publishedAt: true,
                      createdAt: true,
                      author: { select: { name: true } },
                  },
              })
            : [],
        // Newest first: the question this section answers is "when did I last
        // make this", and the answer is then the first row. The pictures
        // inside an entry go the other way, in the order somebody arranged
        // them — within one evening a sequence reads forwards.
        isMember
            ? prisma.cookEntry.findMany({
                  where: { recipeId: recipe.id },
                  orderBy: { cookedAt: 'desc' },
                  take: 30,
                  select: {
                      id: true,
                      cookedAt: true,
                      note: true,
                      userId: true,
                      user: { select: { name: true, avatarUrl: true } },
                      photos: { orderBy: { position: 'asc' }, select: { id: true, url: true } },
                  },
              })
            : [],
        // Computed from the recipe's own search vector, which already exists
        // and is already indexed. See lib/similarRecipes.
        isMember ? similarRecipes(recipe, locale) : [],
    ]);

    const hasViewed = cookieStore.has(`viewed_recipe_${recipe.id}`);

    // Shown optimistically; the actual increment happens in ViewTracker so that
    // a server component never has to write a cookie.
    const views = !user?.admin && !hasViewed ? recipe.views + 1 : recipe.views;

    const isFavorited = favorite !== null;
    const userRatingValue = ownRating?.value ?? 0;

    /*
     * A draft says so on its own page.
     *
     * This is where he will be standing when it matters — cooking from it,
     * adjusting it — and it is the only place the state is visible without
     * going looking for it. The button is here too, because "I have now cooked
     * this and it is good" is a thought you have at the stove, not later on a
     * list page.
     */
    const tDrafts = await getTranslations({ locale, namespace: 'Drafts' });

    const banner = recipe.isDraft ? (
        <div className={`${pageContainer} ${pageTop}`}>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-control p-4">
                <p className="max-w-prose font-serif text-sm text-muted">{tDrafts('banner')}</p>
                {user?.admin && <FinishDraft recipeId={recipe.id} />}
            </div>
        </div>
    ) : null;

    return (
        <>
        {banner}
        <RecipeArticle
            recipe={recipe}
            similar={similar}
            notes={notes}
            cooked={cooked}
            currentUserId={user?.id ?? null}
            locale={locale}
            // A member sees the cookbook; a visitor to a public recipe sees
            // the recipe. "shared" is already exactly that shape — it is what
            // a share link renders — so there is no third mode to keep in
            // step with the other two.
            mode={isMember ? 'private' : 'shared'}
            isLoggedIn={Boolean(user)}
            isAdmin={Boolean(user?.admin)}
            isFavorited={isFavorited}
            userRatingValue={userRatingValue}
            views={views}
            url={`${getSiteUrl()}/${locale}/recipe/${recipe.slug}`}
            // Only an admin is given the secret link: it ends up in the page's data.
            publicUrl={user?.admin && recipe.shareToken ? shareUrl(getSiteUrl(), locale, recipe.shareToken) : null}
        />
        </>
    );
}
