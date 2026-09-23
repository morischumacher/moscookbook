import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import RatingDisplay from '@/components/RatingDisplay';
import FavoriteButton from '@/components/FavoriteButton';
import RecipeSource from '@/components/recipe/RecipeSource';
import ViewTracker from '@/components/ViewTracker';
import Logo from '@/components/brand/Logo';
import ReactMarkdown from 'react-markdown';
import RecipeBody from '@/components/recipe/RecipeBody';
import { splitSteps } from '@/lib/steps';
import { withCelsius } from '@/lib/units';
import { KNOWN_TAGS, TAG_ICONS, chillies } from '@/lib/tags';
import { headLabels } from '@/lib/recipeLabels';
import Gallery from '@/components/recipe/Gallery';
import RecipeNotes, { type RecipeNote } from '@/components/recipe/RecipeNotes';
import Cooked, { type CookedEntry } from '@/components/recipe/Cooked';
import SimilarRecipes from '@/components/recipe/SimilarRecipes';
import type { SimilarRecipe } from '@/lib/similarRecipes';
import type { StructuredIngredient } from '@/lib/ingredientParts';
import { formatMinutes } from '@/lib/amount';
import { buildRecipeJsonLd } from '@/lib/recipeJsonLd';
import { formatDate } from '@/lib/formatDate';
import { inLanguage, type StoredTranslation } from '@/lib/recipeTranslation';

export interface RecipeRow {
    id: number;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    /** Every category and cuisine; the first ones are the two fields above. */
    categories: string[];
    cuisines: string[];
    /** 0–3 chillies. */
    spiciness: number;
    instructions: string;
    views: number;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    tags: string[];
    createdAt: Date;
    /** Whether the recipe's own address works without an account. */
    isPublic: boolean;
    /**
     * Imported and tidied, but not yet one of this cookbook's own.
     *
     * Carried on the row rather than looked up where it is needed, because
     * every surface that renders a recipe has to be able to refuse a draft to
     * somebody without an account, and a field that has to be fetched
     * separately is a field somebody will forget to fetch.
     */
    isDraft: boolean;
    shareToken: string | null;
    /**
     * The recipe's own searchable wording. Not shown anywhere — it is what
     * "recipes like this one" is computed from, and it comes with the row
     * that is already being read rather than costing a second query.
     */
    searchTitle: string;
    searchBody: string;
    images: { url: string }[];
    ratings: { value: number; userId: number }[];
    ingredients: StructuredIngredient[];
    /**
     * The share this recipe was made from, for its link and nothing else.
     * Optional: a recipe typed in by hand has no capture behind it, and the
     * surfaces that render a recipe without asking for one (the shared page
     * builds its own row) should not have to invent an empty array.
     */
    captures?: { sourceUrl: string | null }[];
    /** The language it was written in, and its translation. See lib/recipeTranslation. */
    language?: string | null;
    translations?: StoredTranslation[];
}

/** What the page needs from the database, in one place so both routes agree. */
export const recipeInclude = {
    images: { orderBy: { position: 'asc' } },
    ratings: true,
    ingredients: { orderBy: { position: 'asc' } },
    /*
     * The capture this recipe was made from, for the one field worth showing:
     * where it came from. One row, because a recipe is made from one share —
     * a merge attaches a second, and the first is the one that made it.
     *
     * Only ever read for the link. Everything else on a capture is the raw
     * material the recipe replaced.
     */
    captures: { orderBy: { id: 'asc' }, take: 1, select: { sourceUrl: true } },
    // Both, at most two rows; the page picks the reader's (lib/recipeTranslation).
    translations: { select: { locale: true, title: true, description: true, instructions: true, ingredients: true } },
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
     * Who cooked this, when, what they would change and what it looked like.
     *
     * Empty on the shared page and on a public recipe: somebody who wrote a
     * note or put a photograph into a private cookbook did not agree to it
     * travelling out of it on a link.
     */
    cooked: CookedEntry[];
    /** Whose entries are whose. Null for a reader with no account. */
    currentUserId: number | null;
    /**
     * Four recipes like this one. Empty on the shared page: somebody holding a
     * link to one recipe was given that recipe, not a way into the rest of a
     * private cookbook.
     */
    similar: SimilarRecipe[];
}

export default async function RecipeArticle({
    recipe: written,
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
    similar,
}: RecipeArticleProps) {
    // In the reader's language when it has been translated into it.
    const recipe = inLanguage(written, locale);
    const t = await getTranslations('Recipe');
    const tTags = await getTranslations('Tags');
    const tagLabel = (tag: string) => (KNOWN_TAGS.includes(tag) ? tTags(tag as 'vegan') : `#${tag}`);

    // The method one step each, with any Fahrenheit given in Celsius beside
    // it: the oven here has a Celsius dial.
    const stepTexts = splitSteps(withCelsius(recipe.instructions));
    const tCategory = await getTranslations('Categories');
    const tCuisine = await getTranslations('Cuisines');

    const averageRating =
        recipe.ratings.length > 0
            ? recipe.ratings.reduce((sum: number, rating: { value: number }) => sum + rating.value, 0) /
              recipe.ratings.length
            : 0;

    // Free text as well as the usual ones, so only the known values are
    // translated. At most three in the head, however many there are: a
    // recipe filed under nine must not push its own title down the page.
    const labels = [
        ...recipe.categories.map((value) => (tCategory.has(value) ? tCategory(value) : value)),
        ...recipe.cuisines.map((value) => (tCuisine.has(value) ? tCuisine(value) : value)),
    ];
    const head = headLabels(labels);

    const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    const times = [
        recipe.prepMinutes ? { label: t('prepTime'), value: formatMinutes(recipe.prepMinutes) } : null,
        recipe.cookMinutes ? { label: t('cookTime'), value: formatMinutes(recipe.cookMinutes) } : null,
        recipe.prepMinutes && recipe.cookMinutes
            ? { label: t('totalTime'), value: formatMinutes(totalMinutes) }
            : null,
        recipe.servings ? { label: t('servings'), value: String(recipe.servings) } : null,
    ].filter((entry): entry is { label: string; value: string } => entry !== null);


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
                {/* "hero": full width on a phone, the reading column's width on
                    a laptop. Without it the photograph spanned the whole
                    screen and was taller than the window. */}
                <Gallery
                    variant="hero"
                    images={recipe.images.map((image) => image.url)}
                    title={recipe.title}
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
                    {head.shown.join(' · ') || formatDate(recipe.createdAt, locale, 'short')}
                    {head.more > 0 && <span title={labels.slice(3).join(', ')}> · +{head.more}</span>}
                </p>

                <h1 className="mt-2 text-3xl font-extrabold leading-[1.12] tracking-tight text-ink sm:text-4xl">
                    {recipe.title}
                </h1>

                {recipe.translated && written.language && (
                    <p lang={locale} className="mt-1 text-xs text-faint">
                        {t('translatedFrom', { language: written.language })}
                    </p>
                )}

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

                {/* What is in it and how hot, with their icons: the first thing
                    somebody vegetarian or chilli-shy looks for. */}
                {(recipe.tags.some((tag) => KNOWN_TAGS.includes(tag)) || recipe.spiciness > 0) && (
                    <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
                        {recipe.tags
                            .filter((tag) => KNOWN_TAGS.includes(tag))
                            .map((tag) => (
                                <span key={tag}>
                                    <span aria-hidden="true">{TAG_ICONS[tag]}</span> {tagLabel(tag)}
                                </span>
                            ))}
                        {recipe.spiciness > 0 && (
                            <span title={tTags('spicinessLevel', { level: recipe.spiciness })}>
                                <span aria-hidden="true">{chillies(recipe.spiciness)}</span>{' '}
                                {tTags('spicinessLevel', { level: recipe.spiciness })}
                            </span>
                        )}
                    </p>
                )}

                {/* Tags lead back to the list, filtered — "what else is vegan".
                    Only for people with an account: the list is theirs. */}
                {recipe.tags.some((tag) => !KNOWN_TAGS.includes(tag)) && (
                    <div className="print:hidden mt-3 flex flex-wrap gap-2 text-sm">
                        {recipe.tags.filter((tag) => !KNOWN_TAGS.includes(tag)).map((tag) =>
                            mode === 'private' ? (
                                <Link
                                    key={tag}
                                    href={`/?tag=${encodeURIComponent(tag)}`}
                                    className="rounded-full border border-line px-3 py-1 text-muted hover:border-ink hover:text-ink"
                                >
                                    {tagLabel(tag)}
                                </Link>
                            ) : (
                                <span key={tag} className="rounded-full border border-line px-3 py-1 text-muted">
                                    {tagLabel(tag)}
                                </span>
                            )
                        )}
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
                        // On paper, so it takes the page's own ink rather than
                        // the muted colour of the meta line it stands in: this
                        // is the heart somebody actually presses, and it
                        // should not look like a caption.
                        <span className="shrink-0 text-ink">
                            <FavoriteButton
                                recipeId={recipe.id}
                                initialFavorited={isFavorited}
                                disabled={!isLoggedIn}
                            />
                        </span>
                    )}
                </div>

                {/*
                    Where it came from, under the row about what people thought
                    of it — which is the same kind of fact: something about the
                    recipe rather than part of it.

                    Shown to whoever can see the page, including somebody
                    holding a shared link: crediting the blog a recipe was
                    taken from is the right thing to do in front of a guest,
                    not something to hide from one.
                */}
                {recipe.captures?.[0]?.sourceUrl && (
                    <div className="print:hidden mt-4">
                        <RecipeSource url={recipe.captures[0].sourceUrl} />
                    </div>
                )}

                {/*
                    The visibility panel that stood here is gone.
                    
                    It answered "who can see this" with two of the three
                    stages and a box, while the Share button further down
                    answered it a third way by minting a link without saying
                    so. One control now — the button opens it — and the one
                    thing the panel had that the button did not, a state you
                    could read without pressing anything, is the line beside
                    the button in the admin list.
                */}

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
                    recipeId={recipe.id}
                    ingredients={recipe.ingredients}
                    steps={stepTexts.map((step, index) => (
                        <ReactMarkdown key={index}>{step}</ReactMarkdown>
                    ))}
                    stepTexts={stepTexts}
                    canShop={mode === 'private' && isLoggedIn}
                    baseServings={recipe.servings}
                    title={recipe.title}
                    locale={locale}
                    /*
                     * Where this recipe stands, and whether this person may
                     * move it. The button opens the dialog for an admin and
                     * hands the address over directly for anybody else —
                     * somebody holding a shared link has no stages to choose
                     * between, so a dialog would only be three refusals.
                     */
                    share={{
                        isPublic: recipe.isPublic,
                        linkUrl: publicUrl,
                        ownUrl: url,
                        mayChange: mode === 'private' && isAdmin,
                    }}
                />

                {mode === 'private' && (
                    <>
                        {/* One section, not two. The fact, the note and the
                            pictures are one evening — see the component. */}
                        <Cooked
                            recipeId={recipe.id}
                            entries={cooked}
                            canLog={isLoggedIn}
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

                        <SimilarRecipes recipes={similar} />
                    </>
                )}
            </div>
        </article>
    );
}
