import { getTranslations } from 'next-intl/server';
import RatingDisplay from '@/components/RatingDisplay';
import FavoriteButton from '@/components/FavoriteButton';
import ViewTracker from '@/components/ViewTracker';
import Logo from '@/components/brand/Logo';
import RecipeBody from '@/components/recipe/RecipeBody';
import Gallery from '@/components/recipe/Gallery';
import ShareLink from '@/components/recipe/ShareLink';
import RecipeNotes, { type RecipeNote } from '@/components/recipe/RecipeNotes';
import CookedPhotos, { type CookedPhoto } from '@/components/recipe/CookedPhotos';
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
    /**
     * Entries written about this recipe. Empty on the shared page: a note is a
     * kitchen diary, and the person you sent a recipe to did not ask for it.
     */
    notes: RecipeNote[];
    /**
     * Pictures of the dish as other people cooked it. Empty on the shared page:
     * somebody who put a photograph into a private cookbook did not agree to it
     * travelling out of it on a link.
     */
    cooked: CookedPhoto[];
    /** Whose pictures are whose. Null for a reader with no account. */
    currentUserId: number | null;
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
    notes,
    cooked,
    currentUserId,
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

            {/*
                The photograph opens the page, full width and edge to edge, and
                the content rides up over its bottom edge on a rounded sheet.
                A recipe is a picture of a dish before it is a list of words,
                and this is the layout that says so.

                Not on paper: a printed recipe wants its method on the first
                page, not a photograph filling it.
            */}
            <div className="print:hidden">
                <Gallery
                    images={recipe.images.map((image) => image.url)}
                    title={recipe.title}
                    variant="hero"
                />
            </div>

            <header className="relative z-10 mx-auto -mt-7 max-w-2xl rounded-t-3xl bg-page px-4 pt-7 sm:-mt-10 sm:px-8 print:mt-0 print:rounded-none print:pt-8">
                {/* The print stylesheet hides the navigation, and the logo used
                    to go with it — a printed recipe came out unbranded. This is
                    the same mark, shown only on paper. */}
                <div className="hidden print:mb-6 print:block">
                    <Logo height={32} />
                </div>

                <p className="text-xs font-semibold uppercase tracking-widest text-faint">
                    {[categoryLabel, cuisineLabel].filter(Boolean).join(' · ') ||
                        dateFormatter.format(recipe.createdAt)}
                </p>

                <h1 className="mt-2 text-3xl font-extrabold leading-[1.12] tracking-tight text-ink sm:text-4xl">
                    {recipe.title}
                </h1>

                {recipe.description && (
                    <p className="mt-3 font-serif text-lg italic leading-relaxed text-muted sm:text-xl">
                        {recipe.description}
                    </p>
                )}

                {/*
                    Times, servings and the rating as one row of pills. They are
                    the same kind of fact — small, countable, glanced at — and
                    they used to be spread over a bordered date line, a
                    definition list and a rating row, three typographic voices
                    for one paragraph's worth of information.
                */}
                {(times.length > 0 || recipe.ratings.length > 0) && (
                    <div className="print:hidden mt-5 flex flex-wrap items-center gap-2">
                        {times.map((entry) => (
                            <span
                                key={entry.label}
                                className="rounded-full bg-surface px-3 py-1.5 text-sm text-muted"
                            >
                                <span className="text-faint">{entry.label}</span> {entry.value}
                            </span>
                        ))}
                    </div>
                )}

                {/* The heart shares the rating's row rather than taking one of
                    its own: they are the same gesture — what you thought of it —
                    and stacked they cost three lines between the facts above and
                    the recipe below. */}
                <div className="print:hidden mt-5 flex items-start justify-between gap-4">
                    <RatingDisplay
                        recipeId={recipe.id}
                        initialAverage={averageRating}
                        initialCount={recipe.ratings.length}
                        initialUserRating={userRatingValue}
                        isLoggedIn={mode === 'private' && isLoggedIn}
                        views={views}
                        infoClassName="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted"
                    />

                    {mode === 'private' && (
                        <span className="shrink-0">
                            <FavoriteButton
                                recipeId={recipe.id}
                                initialFavorited={isFavorited}
                                disabled={!isLoggedIn}
                            />
                        </span>
                    )}
                </div>

                {mode === 'private' && isAdmin && (
                    <div className="print:hidden mt-6">
                        <ShareLink id={recipe.id} kind="recipe" initialUrl={publicUrl} locale={locale} />
                    </div>
                )}

                {/* On paper the pills and the picture are gone, so the facts
                    come back as a plain line. */}
                <dl className="hidden print:mt-4 print:flex print:flex-wrap print:gap-x-8">
                    {times.map((entry) => (
                        <div key={entry.label}>
                            <dt className="text-xs uppercase tracking-widest text-muted">{entry.label}</dt>
                            <dd className="text-base font-semibold text-ink">{entry.value}</dd>
                        </div>
                    ))}
                </dl>
            </header>

            <div className="h-10 w-full sm:h-14" aria-hidden="true" />

            <div className="container mx-auto max-w-2xl px-4 font-serif sm:px-8">
                <RecipeBody
                    ingredients={recipe.ingredients}
                    instructions={recipe.instructions}
                    baseServings={recipe.servings}
                    title={recipe.title}
                    // What the share sheet hands over: the public link when one
                    // exists, so that it reaches someone without an account.
                    // Left undefined otherwise, which shares the address of the
                    // page itself — fine between two people who both have an
                    // account, and for anyone else the login form now carries
                    // them on to the recipe once they are in.
                    shareUrl={mode === 'shared' ? url : publicUrl ?? undefined}
                />

                {mode === 'private' && (
                    <>
                        <CookedPhotos
                            recipeId={recipe.id}
                            photos={cooked}
                            canAdd={isLoggedIn}
                            isAdmin={isAdmin}
                            currentUserId={currentUserId}
                            locale={locale}
                        />

                        <RecipeNotes
                            notes={notes}
                            recipeId={recipe.id}
                            isAdmin={isAdmin}
                            locale={locale}
                        />
                    </>
                )}
            </div>
        </article>
    );
}
