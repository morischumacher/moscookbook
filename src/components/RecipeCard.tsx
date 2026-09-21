'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import Rating from './Rating';
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
 * The picture is the object and the words sit on it. A cookbook is usually
 * opened with the question "what do I feel like", and that question is answered
 * by looking, not by reading — six dishes on a screen answer it faster than two
 * rows of prose.
 *
 * What the tile gives up is the description. On a 170px-wide tile two lines of
 * serif would be four words and an ellipsis, which is not a summary of
 * anything; the recipe's own page is one tap away and has room for it.
 *
 * What it keeps is the rating, because the oysters are the one mark in this
 * cookbook that is nobody else's, and a grid of pictures with no sign of which
 * ones turned out well would be a worse list than the one before it.
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

    // Both fields are free text, so only the known values get translated.
    const categoryLabel = category && tCategory.has(category) ? tCategory(category) : category;
    const cuisineLabel = nationality && tCuisine.has(nationality) ? tCuisine(nationality) : nationality;

    return (
        <div className="group relative">
            <Link
                href={`/recipe/${slug}`}
                className="block aspect-square w-full overflow-hidden rounded-xl bg-surface"
            >
                {imageUrl ? (
                    <span className="relative block h-full w-full">
                        <Image
                            src={imageUrl}
                            alt=""
                            fill
                            sizes="(min-width: 640px) 320px, 45vw"
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        {/*
                            A solid band, not a gradient fading into the picture.
                            The text has to clear 4.5:1 over whatever photograph
                            happens to be underneath, and only an opaque backing
                            can promise that — a fade promises it over a dark
                            sky and breaks it over a plate of polenta.
                        */}
                        <span className="absolute inset-x-0 bottom-0 block bg-ink/85 px-3 py-2.5">
                            <span className="block text-[15px] font-bold leading-tight text-page">
                                {title}
                            </span>
                            {rating > 0 && (
                                <span className="mt-1.5 block text-page">
                                    <Rating value={rating} readonly size="sm" onDark />
                                </span>
                            )}
                        </span>
                    </span>
                ) : (
                    /*
                        The weak spot of a grid of pictures: a recipe that has
                        none. Rather than a blank square with a caption stuck to
                        the bottom, the title takes the whole tile and becomes
                        the picture — which is what a tile without a photograph
                        should look like, not like one that failed to load.
                    */
                    <span className="flex h-full w-full flex-col justify-end p-3">
                        {(categoryLabel || cuisineLabel) && (
                            <span className="block text-[11px] font-semibold uppercase tracking-widest text-faint">
                                {[categoryLabel, cuisineLabel].filter(Boolean).join(' · ')}
                            </span>
                        )}
                        <span className="mt-1 block text-lg font-bold leading-tight text-ink">
                            {title}
                        </span>
                        {rating > 0 && (
                            <span className="mt-2 block">
                                <Rating value={rating} readonly size="sm" />
                            </span>
                        )}
                    </span>
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
