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

export default function RecipeCard({ id, title, description, imageUrl, slug, category, rating, nationality, isFavorited = false, isLoggedIn = false }: RecipeCardProps) {
    const tCategory = useTranslations('Categories');
    const tCuisine = useTranslations('Cuisines');

    // Both fields are free text, so only the known values get translated.
    const categoryLabel = category && tCategory.has(category) ? tCategory(category) : category;
    const cuisineLabel = nationality && tCuisine.has(nationality) ? tCuisine(nationality) : nationality;

    return (
        <Link
            href={`/recipe/${slug}`}
            className="group flex flex-row items-start gap-5 py-6 sm:py-7"
        >
            <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="text-xl font-bold leading-snug tracking-tight decoration-1 underline-offset-4 group-hover:underline sm:text-2xl">
                    {title}
                </h3>

                {/*
                    Directly under the title, where it reads as what this dish
                    is. It used to be a line of uppercase with wide tracking
                    below the description, which made the least important thing
                    in the card the loudest after the title.

                    On its own line rather than beside the rating: the column is
                    about 260px on a phone, and the rating and the heart leave
                    the words roughly a hundred of them — enough to truncate
                    "Hauptgericht" into "Hauptgeric…", which is worse than the
                    row it would have saved.
                */}
                {(categoryLabel || cuisineLabel) && (
                    <p className="mt-1.5 text-sm text-faint">
                        {[categoryLabel, cuisineLabel].filter(Boolean).join(' · ')}
                    </p>
                )}

                {description && (
                    <p className="mt-3 line-clamp-2 font-serif text-base leading-relaxed text-muted">
                        {description}
                    </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-4">
                    <Rating value={rating} readonly />

                    {/* Inside the card's Link, so the click must not navigate. */}
                    <div className="shrink-0" onClick={(event) => event.preventDefault()}>
                        <FavoriteButton
                            recipeId={id}
                            initialFavorited={isFavorited}
                            disabled={!isLoggedIn}
                        />
                    </div>
                </div>
            </div>

            {/*
                Bigger, and without the outline. A 96px square in a box read as
                an icon standing in for a photograph; this reads as the
                photograph. The tinted square is only what shows through when
                there is no picture yet.
            */}
            <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-xl bg-surface transition-transform duration-200 group-hover:scale-[1.02] sm:w-36">
                {imageUrl && (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        sizes="(min-width: 640px) 144px, 112px"
                        className="object-cover"
                    />
                )}
            </div>
        </Link>
    );
}
