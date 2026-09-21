import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import RatingDisplay from '@/components/RatingDisplay';
import FavoriteButton from '@/components/FavoriteButton';
import ViewTracker from '@/components/ViewTracker';
import Logo from '@/components/brand/Logo';
import RecipeBody from '@/components/recipe/RecipeBody';
import Gallery from '@/components/recipe/Gallery';
import AddToListButton from '@/components/shopping/AddToListButton';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import type { StructuredIngredient } from '@/lib/ingredientParts';
import { formatMinutes } from '@/lib/amount';
import { getTranslations } from 'next-intl/server';
import { buildRecipeJsonLd } from '@/lib/recipeJsonLd';
import { getSiteUrl } from '@/lib/siteUrl';

interface RecipeRow {
    id: number;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    instructions: string;
    views: number;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    createdAt: Date;
    images: { url: string }[];
    ratings: { value: number; userId: number }[];
    ingredients: StructuredIngredient[];
}

// generateMetadata and the page itself both need the recipe; cache() makes
// that a single database round trip per request instead of two.
const loadRecipe = cache(async (slug: string): Promise<RecipeRow | null> => {
    return prisma.recipe.findUnique({
        where: { slug },
        include: {
            images: { orderBy: { position: 'asc' } },
            ratings: true,
            ingredients: { orderBy: { position: 'asc' } },
        },
    });
});

/** Gives shared links a real title, description and picture. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
    const { slug, locale } = await params;
    const recipe = await loadRecipe(slug);

    const t = await getTranslations({ locale, namespace: 'Recipe' });

    if (!recipe) return { title: t('notFound') };

    const description =
        recipe.description?.trim() ||
        `${recipe.category ? recipe.category + ' · ' : ''}${t('metaFallback')}`;

    // A recipe with no photograph still has to look like something when it is
    // sent to someone. Without a picture WhatsApp and Signal show a bare link,
    // which reads like spam; the branded card at least says where it is from.
    const image = recipe.images[0]?.url ?? '/og-default.png';

    return {
        title: `${recipe.title} — mo'scookbook`,
        description,
        alternates: { canonical: `/${locale}/recipe/${recipe.slug}` },
        openGraph: {
            type: 'article',
            siteName: "mo'scookbook",
            locale,
            title: recipe.title,
            description,
            publishedTime: recipe.createdAt.toISOString(),
            url: `/${locale}/recipe/${recipe.slug}`,
            images: [{ url: image, alt: recipe.title, width: 1200, height: 630 }],
        },
        twitter: {
            card: 'summary_large_image',
            title: recipe.title,
            description,
            images: [image],
        },
    };
}

export default async function RecipePage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    const { slug, locale } = await params;

    const recipeData = await loadRecipe(slug);
    if (!recipeData) notFound();

    const cookieStore = await cookies();
    const session = await getSession();
    const hasViewed = cookieStore.has(`viewed_recipe_${recipeData.id}`);

    // Shown optimistically; the actual increment happens in ViewTracker so that
    // a server component never has to write a cookie.
    const views = !session.user?.admin && !hasViewed ? recipeData.views + 1 : recipeData.views;

    const averageRating =
        recipeData.ratings.length > 0
            ? recipeData.ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) /
            recipeData.ratings.length
            : 0;

    let isFavorited = false;
    let userRatingValue = 0;

    if (session.user) {
        const userId = session.user.id;
        const favorite = await prisma.favorite.findUnique({
            where: { userId_recipeId: { userId, recipeId: recipeData.id } },
        });
        isFavorited = favorite !== null;
        userRatingValue =
            recipeData.ratings.find((rating: { userId: number }) => rating.userId === userId)?.value ?? 0;
    }

    const t = await getTranslations('Recipe');
    const tCategory = await getTranslations('Categories');
    const tCuisine = await getTranslations('Cuisines');

    // Category and cuisine are free text, so only translate the known values.
    const categoryLabel = recipeData.category
        ? (tCategory.has(recipeData.category) ? tCategory(recipeData.category) : recipeData.category)
        : '';
    const cuisineLabel = recipeData.nationality
        ? (tCuisine.has(recipeData.nationality) ? tCuisine(recipeData.nationality) : recipeData.nationality)
        : '';


    const totalMinutes = (recipeData.prepMinutes ?? 0) + (recipeData.cookMinutes ?? 0);
    const times = [
        recipeData.prepMinutes ? { label: t('prepTime'), value: formatMinutes(recipeData.prepMinutes) } : null,
        recipeData.cookMinutes ? { label: t('cookTime'), value: formatMinutes(recipeData.cookMinutes) } : null,
        recipeData.prepMinutes && recipeData.cookMinutes
            ? { label: t('totalTime'), value: formatMinutes(totalMinutes) }
            : null,
        recipeData.servings ? { label: t('servings'), value: String(recipeData.servings) } : null,
    ].filter((entry): entry is { label: string; value: string } => entry !== null);

    const dateFormatter = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <article className="min-h-screen w-full bg-page pb-32">
            <ViewTracker recipeId={recipeData.id} />

            {/* The markup this application reads out of other people's pages,
                written for ours. JSON.stringify escapes the content, and the
                only way out of a script block is the closing tag, so that one
                sequence is broken up. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(
                        buildRecipeJsonLd({
                            ...recipeData,
                            url: `${getSiteUrl()}/${locale}/recipe/${recipeData.slug}`,
                        })
                    ).replace(/</g, '\\u003c'),
                }}
            />

            <header className="container mx-auto max-w-2xl px-4 pt-8 sm:px-8 sm:pt-16">
                {/* The print stylesheet hides the navigation, and the logo used
                    to go with it — a printed recipe came out unbranded. This is
                    the same mark, shown only on paper. */}
                <div className="hidden print:mb-6 print:block">
                    <Logo height={32} />
                </div>

                <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl md:text-6xl">
                    {recipeData.title}
                    <span className="print:hidden ml-4 inline-block align-middle">
                        <FavoriteButton
                            recipeId={recipeData.id}
                            initialFavorited={isFavorited}
                            disabled={!session.user}
                        />
                    </span>
                </h1>

                <div className="my-6 flex flex-col gap-1 border-y border-line py-4">
                    <span className="text-sm font-medium uppercase tracking-widest text-muted">
                        {dateFormatter.format(recipeData.createdAt)}
                        {categoryLabel ? ` • ${categoryLabel}` : ''}
                        {cuisineLabel ? ` • ${cuisineLabel}` : ''}
                    </span>
                </div>

                <div className="print:hidden mb-6">
                    <AddToListButton recipeId={recipeData.id} />
                </div>

                <div className="print:hidden mb-8">
                    <RatingDisplay
                        recipeId={recipeData.id}
                        initialAverage={averageRating}
                        initialCount={recipeData.ratings.length}
                        initialUserRating={userRatingValue}
                        isLoggedIn={Boolean(session.user)}
                        views={views}
                        infoClassName="flex items-center gap-6 text-sm font-semibold text-muted py-3"
                    />
                </div>
            </header>

            <div className="container mx-auto max-w-2xl px-0 sm:px-8">
                <Gallery
                    images={recipeData.images.map((image) => image.url)}
                    title={recipeData.title}
                />

                {recipeData.description && (
                    <p className="mt-8 px-4 text-left font-serif text-xl italic leading-relaxed text-ink sm:px-0 sm:text-2xl">
                        {recipeData.description}
                    </p>
                )}

                {times.length > 0 && (
                    <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 px-4 sm:px-0">
                        {times.map((entry) => (
                            <div key={entry.label}>
                                <dt className="text-xs font-bold uppercase tracking-widest text-muted">
                                    {entry.label}
                                </dt>
                                <dd className="mt-1 text-lg font-semibold text-ink">
                                    {entry.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>

            <div className="h-16 w-full sm:h-24" aria-hidden="true" />

            <div className="container mx-auto max-w-2xl px-4 font-serif sm:px-8">
                <RecipeBody
                    ingredients={recipeData.ingredients}
                    instructions={recipeData.instructions}
                    baseServings={recipeData.servings}
                    title={recipeData.title}
                    description={recipeData.description ?? undefined}
                />
            </div>
        </article>
    );
}
