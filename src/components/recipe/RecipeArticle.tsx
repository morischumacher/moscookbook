import { getTranslations } from 'next-intl/server';
import RatingDisplay from '@/components/RatingDisplay';
import FavoriteButton from '@/components/FavoriteButton';
import ViewTracker from '@/components/ViewTracker';
import Logo from '@/components/brand/Logo';
import RecipeBody from '@/components/recipe/RecipeBody';
import Gallery from '@/components/recipe/Gallery';
import ShareLink from '@/components/recipe/ShareLink';
import type { StructuredIngredient } from '@/lib/ingredientParts';
import { formatMinutes } from '@/lib/amount';
import { buildRecipeJsonLd } from '@/lib/recipeJsonLd';

export interface RecipeRow {
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
    shareToken: string | null;
    images: { url: string }[];
    ratings: { value: number; userId: number }[];
    ingredients: StructuredIngredient[];
}

/** What the page needs from the database, in one place so both routes agree. */
export const recipeInclude = {
    images: { orderBy: { position: 'asc' } },
    ratings: true,
    ingredients: { orderBy: { position: 'asc' } },
} as const;

export interface RecipeArticleProps {
    recipe: RecipeRow;
    locale: string;
    /**
     * `private` is the cookbook itself: signed in, everything works.
     * `shared` is somebody holding a link, who has no account and is not going
     * to make one — so nothing that needs an account is offered to them, rather
     * than offered and then refused.
     */
    mode: 'private' | 'shared';
    isLoggedIn: boolean;
    isAdmin: boolean;
    isFavorited: boolean;
    userRatingValue: number;
    views: number;
    /** The canonical address of whichever page is being rendered. */
    url: string;
    /** The public link, when one exists. Only ever shown to an admin. */
    publicUrl: string | null;
}

export default async function RecipeArticle({
    recipe,
    locale,
    mode,
    isLoggedIn,
    isAdmin,
    isFavorited,
    userRatingValue,
    views,
    url,
    publicUrl,
}: RecipeArticleProps) {
    const t = await getTranslations('Recipe');
    const tCategory = await getTranslations('Categories');
    const tCuisine = await getTranslations('Cuisines');

    const averageRating =
        recipe.ratings.length > 0
            ? recipe.ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) /
              recipe.ratings.length
            : 0;

    // Category and cuisine are free text, so only translate the known values.
    const categoryLabel = recipe.category
        ? tCategory.has(recipe.category)
            ? tCategory(recipe.category)
            : recipe.category
        : '';
    const cuisineLabel = recipe.nationality
        ? tCuisine.has(recipe.nationality)
            ? tCuisine(recipe.nationality)
            : recipe.nationality
        : '';

    const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    const times = [
        recipe.prepMinutes ? { label: t('prepTime'), value: formatMinutes(recipe.prepMinutes) } : null,
        recipe.cookMinutes ? { label: t('cookTime'), value: formatMinutes(recipe.cookMinutes) } : null,
        recipe.prepMinutes && recipe.cookMinutes
            ? { label: t('totalTime'), value: formatMinutes(totalMinutes) }
            : null,
        recipe.servings ? { label: t('servings'), value: String(recipe.servings) } : null,
    ].filter((entry): entry is { label: string; value: string } => entry !== null);

    const dateFormatter = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <article className="min-h-screen w-full bg-page pb-32">
            {mode === 'private' && <ViewTracker recipeId={recipe.id} />}

            {/* The markup this application reads out of other people's pages,
                written for ours. Only on the shared page: the private one is
                behind a login, so nothing is there to read it, and emitting a
                machine-readable copy of a recipe that is supposed to need an
                account would be an odd thing to do.
                JSON.stringify escapes the content, and the only way out of a
                script block is the closing tag, so that one sequence is broken
                up. */}
            {mode === 'shared' && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(buildRecipeJsonLd({ ...recipe, url })).replace(
                            /</g,
                            '\\u003c'
                        ),
                    }}
                />
            )}

            <header className="container mx-auto max-w-2xl px-4 pt-8 sm:px-8 sm:pt-16">
                {/* The print stylesheet hides the navigation, and the logo used
                    to go with it — a printed recipe came out unbranded. This is
                    the same mark, shown only on paper. */}
                <div className="hidden print:mb-6 print:block">
                    <Logo height={32} />
                </div>

                <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl md:text-6xl">
                    {recipe.title}
                    {mode === 'private' && (
                        <span className="print:hidden ml-4 inline-block align-middle">
                            <FavoriteButton
                                recipeId={recipe.id}
                                initialFavorited={isFavorited}
                                disabled={!isLoggedIn}
                            />
                        </span>
                    )}
                </h1>

                <div className="my-6 flex flex-col gap-1 border-y border-line py-4">
                    <span className="text-sm font-medium uppercase tracking-widest text-muted">
                        {dateFormatter.format(recipe.createdAt)}
                        {categoryLabel ? ` • ${categoryLabel}` : ''}
                        {cuisineLabel ? ` • ${cuisineLabel}` : ''}
                    </span>
                </div>

                <div className="print:hidden mb-8">
                    <RatingDisplay
                        recipeId={recipe.id}
                        initialAverage={averageRating}
                        initialCount={recipe.ratings.length}
                        initialUserRating={userRatingValue}
                        isLoggedIn={mode === 'private' && isLoggedIn}
                        views={views}
                        infoClassName="flex items-center gap-6 text-sm font-semibold text-muted py-3"
                    />
                </div>

                {mode === 'private' && isAdmin && (
                    <div className="print:hidden mb-8">
                        <ShareLink recipeId={recipe.id} initialUrl={publicUrl} locale={locale} />
                    </div>
                )}
            </header>

            <div className="container mx-auto max-w-2xl px-0 sm:px-8">
                <Gallery images={recipe.images.map((image) => image.url)} title={recipe.title} />

                {recipe.description && (
                    <p className="mt-8 px-4 text-left font-serif text-xl italic leading-relaxed text-ink sm:px-0 sm:text-2xl">
                        {recipe.description}
                    </p>
                )}

                {times.length > 0 && (
                    <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 px-4 sm:px-0">
                        {times.map((entry) => (
                            <div key={entry.label}>
                                <dt className="text-xs font-bold uppercase tracking-widest text-muted">
                                    {entry.label}
                                </dt>
                                <dd className="mt-1 text-lg font-semibold text-ink">{entry.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>

            <div className="h-16 w-full sm:h-24" aria-hidden="true" />

            <div className="container mx-auto max-w-2xl px-4 font-serif sm:px-8">
                <RecipeBody
                    ingredients={recipe.ingredients}
                    instructions={recipe.instructions}
                    baseServings={recipe.servings}
                    title={recipe.title}
                    description={recipe.description ?? undefined}
                    // What the share sheet hands over: the public link when one
                    // exists, so that it reaches someone without an account.
                    // Left undefined otherwise, which shares the address of the
                    // page itself — fine between two people who both have an
                    // account, and for anyone else the login form now carries
                    // them on to the recipe once they are in.
                    shareUrl={mode === 'shared' ? url : publicUrl ?? undefined}
                />
            </div>
        </article>
    );
}
