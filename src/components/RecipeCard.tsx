'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import Rating from './Rating';
import Oyster from './brand/Oyster';
import FavoriteButton from './FavoriteButton';
import { photoControl } from '@/lib/ui';

interface RecipeCardProps {
    id: number; // For FavoriteButton
    title: string;
    description: string;
    imageUrl: string;
    slug: string;
    category: string;
    rating: number;
    createdAt?: Date;
    nationality?: string;
    isFavorited?: boolean;
    isLoggedIn?: boolean;
}

/**
 * One recipe in the list, as a tile.
 *
 * A cookbook is opened with the question "what do I feel like", and that is
 * answered by looking rather than by reading, so the picture is the object.
 * The description is gone: on a 170px tile two lines of serif are four words
 * and an ellipsis, and the recipe's own page is one tap away.
 *
 * The words used to sit *on* the picture, in a dark band — title on one line,
 * five oysters under it on another. Half of every photograph was covered by a
 * black slab, and the oysters, drawn at 14 pixels in the page colour on
 * near-black, lost their growth rings and turned into five grey smudges.
 * Counting five smudges is not a glance; it is a task, and a tile is a thing
 * you glance at.
 *
 * That was replaced by one oyster and one number on a dark pill in the corner,
 * which was better and still wrong, and it took three rounds of trying to fix
 * the *drawing* before the actual cause was measured: **the oyster does not
 * read below about twenty-two pixels.** A shell is an outline with rings cut
 * inside it, and at sixteen pixels the stroke that makes a ring visible is
 * wide enough to eat the shell it is cut from. Every fix at that size traded
 * one failure for another — rings that closed up into a bean, or a ring so
 * dominant the shell became a sliver — and `detail()` in lib/oysterMark.ts
 * says as much in its own thresholds. The badge was asking for a size the mark
 * does not have.
 *
 * A pill on a photograph cannot be twenty-two pixels; it would be a sticker.
 * So the rating comes off the picture entirely and sits **on paper, on the
 * title's line** — where it can be the size it needs to be, in the accent
 * colour rather than white-on-scrim, with no backing plate and nothing covering
 * the food. The photograph is now completely clean apart from the heart.
 *
 * The full five, which need room to be counted, are on the recipe's own page,
 * where somebody is deciding rather than browsing.
 *
 * What this gives up: with one rating in, "5,0" looks like a verdict. That is
 * the honest cost of a number, and the page behind it says how many people
 * voted.
 */
export default function RecipeCard({
    id,
    title,
    imageUrl,
    slug,
    category,
    rating,
    nationality,
    isFavorited = false,
    isLoggedIn = false,
}: RecipeCardProps) {
    const tCategory = useTranslations('Categories');
    const tCuisine = useTranslations('Cuisines');
    const tRating = useTranslations('Rating');
    const locale = useLocale();

    // One decimal, in the reader's own notation: 4,6 here and 4.6 there.
    const averageLabel = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(rating);

    // Both fields are free text, so only the known values get translated.
    const categoryLabel = category && tCategory.has(category) ? tCategory(category) : category;
    const cuisineLabel = nationality && tCuisine.has(nationality) ? tCuisine(nationality) : nationality;

    return (
        <div className="group relative">
            <Link href={`/recipe/${slug}`} className="block">
                {imageUrl ? (
                    <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-surface">
                        <Image
                            src={imageUrl}
                            alt=""
                            fill
                            sizes="(min-width: 640px) 320px, 45vw"
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                    </span>
                ) : (
                    /*
                        The weak spot of a grid of pictures: a recipe that has
                        none. Rather than a blank square with a caption stuck to
                        the bottom, the title takes the whole tile and becomes
                        the picture — which is what a tile without a photograph
                        should look like, not like one that failed to load. The
                        five oysters stay here, because on an empty tile there
                        is room for them to be legible.
                    */
                    <span className="flex aspect-square w-full flex-col justify-end overflow-hidden rounded-xl bg-surface p-3">
                        {(categoryLabel || cuisineLabel) && (
                            <span className="block text-[11px] font-semibold uppercase tracking-widest text-faint">
                                {[categoryLabel, cuisineLabel].filter(Boolean).join(' · ')}
                            </span>
                        )}
                        <h3 className="mt-1 text-lg font-bold leading-tight text-ink">
                            {title}
                        </h3>
                        {rating > 0 && (
                            <span className="mt-2 block">
                                <Rating value={rating} readonly size="sm" />
                            </span>
                        )}
                    </span>
                )}

                {/* On paper, under the picture. A title only has to be legible
                    against one colour here, instead of against every photograph
                    anybody ever uploads. Repeated on the tile that has no
                    photograph would be saying it twice, so it is not. */}
                {/* An <h3>, not a <span>. A grid of twenty-four recipes with
                    no headings in it cannot be walked by heading, which is how
                    a screen reader reads a list of things — and the title is a
                    heading in every sense except the markup. h3 because the
                    page's h1 is the cookbook and h2 is the section. */}
                {imageUrl && (
                    /*
                        Under the title, on a line of its own — which costs a
                        row of height and was still the right answer.

                        On the title's line it looked better, for a tile whose
                        recipe is called "Pasta". A tile is 170px wide, the
                        rating takes 50 of them, and "Gebratene Nudeln mit
                        Erdnusssauce und Frühlingszwiebeln" then wraps into five
                        lines of two words. Clamping the title to two lines fixes
                        the shape by throwing away the name of the dish, which on
                        a screen whose entire job is telling you which dish this
                        is, is the one thing not available to spend.

                        So the title keeps the full width and the rating goes
                        below it. Three of four real titles are two words and it
                        looks the same either way; the fourth is why.
                    */
                    <div className="mt-2">
                        <h3 className="text-[15px] font-bold leading-tight text-ink">
                            {title}
                        </h3>

                        {rating > 0 && (
                            <span className="mt-1 flex items-center gap-1 text-accent-text">
                                {/*
                                    Twenty-two, which is not a taste: it is the
                                    first rung of `detail()` that gives the shell
                                    two growth rings, and two rings is the least
                                    that reads as a shell rather than as a bean.
                                    Below it the mark has one central ring, which
                                    is fine as an icon and not as a thing you
                                    recognise. Changing this number means looking
                                    at the result, not interpolating.

                                    `cutColor` is left at its default — the page —
                                    because that is exactly what is behind it
                                    here. The whole reason this moved off the
                                    photograph is that on a photograph it was not.
                                */}
                                <Oyster variant="solid" size={22} />
                                <span className="text-[13px] font-semibold leading-none">
                                    {averageLabel}
                                </span>
                                <span className="sr-only">
                                    {tRating('screenReader', { average: averageLabel, max: 5 })}
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </Link>

            {/*
                Outside the Link rather than inside it with preventDefault: a
                button nested in a link is invalid markup, and here there is no
                reason for it — the tile is a picture, and the corner over it is
                free.
            */}
            <div className="absolute right-2 top-2">
                <span
                    className={
                        imageUrl
                            ? photoControl
                            : 'flex h-9 w-9 items-center justify-center'
                    }
                >
                    <FavoriteButton
                        recipeId={id}
                        initialFavorited={isFavorited}
                        disabled={!isLoggedIn}
                    />
                </span>
            </div>
        </div>
    );
}
