'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import Rating from './Rating';
import Oyster from './brand/Oyster';
import FavoriteButton from './FavoriteButton';

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
 * five oysters under it on another. Two things were wrong with that. Half of
 * every photograph was covered by a black slab, and the oysters, drawn at 14
 * pixels in the page colour on near-black, lost their growth rings and turned
 * into five grey smudges. Counting five smudges is not a glance; it is a task,
 * and a tile is a thing you glance at.
 *
 * So the photograph is whole again, the title sits on paper under it, and the
 * rating is one oyster and one number in the corner — read in the time it takes
 * to see it, and comparable between two tiles without counting anything. The
 * full five, big enough to have rings, are on the recipe's own page, which is
 * where somebody is actually deciding rather than browsing.
 *
 * What this gives up: with one rating in, "5.0" looks like a verdict. That is
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

                        {/*
                            A solid pill, not a gradient or a translucent wash.
                            The number has to clear 4.5:1 over whatever
                            photograph happens to be underneath, and only an
                            opaque backing can promise that — a fade promises it
                            over a dark sky and breaks it over a plate of
                            polenta. 75% of the ink is dark enough for the page
                            colour on top of it even where the picture behind is
                            white.
                        */}
                        {rating > 0 && (
                            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ink/75 py-1 pl-1.5 pr-2.5 text-page">
                                {/* 16 rather than 14: the shell's two growth rings are drawn
                                    in the page colour on a filled shell, and at
                                    fourteen pixels on a dark pill they close up
                                    and the oyster becomes a bean. */}
                                <Oyster variant="solid" size={16} />
                                <span className="text-xs font-semibold leading-none">
                                    {averageLabel}
                                </span>
                                <span className="sr-only">
                                    {tRating('screenReader', { average: averageLabel, max: 5 })}
                                </span>
                            </span>
                        )}
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
                    <h3 className="mt-2 text-[15px] font-bold leading-tight text-ink">
                        {title}
                    </h3>
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
                            ? 'flex h-9 w-9 items-center justify-center rounded-full bg-ink/55 text-page'
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
