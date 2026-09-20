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
            className="group flex flex-row items-start justify-between gap-5 py-7 sm:py-8"
        >
            {/* Left Content */}
            <div className="flex min-w-0 flex-1 flex-col">
                <h3 className="mb-2 text-xl font-bold leading-tight tracking-tight decoration-1 underline-offset-4 group-hover:underline sm:text-2xl">
                    {title}
                </h3>
                <p className="mb-4 line-clamp-2 font-serif text-base leading-relaxed text-gray-600 dark:text-gray-400">
                    {description}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
                    <span>{categoryLabel}</span>
                    {cuisineLabel && (
                        <>
                            <span>•</span>
                            <span>{cuisineLabel}</span>
                        </>
                    )}
                    <span>•</span>
                    <Rating value={rating} hideTitle />

                    {/* Favorite Button (Stop Propagation to avoid triggering the Link) */}
                    <div onClick={(e) => e.preventDefault()} className="ml-auto sm:ml-4">
                        <FavoriteButton recipeId={id} initialFavorited={isFavorited} disabled={!isLoggedIn} />
                    </div>
                </div>
            </div>

            {/* Right Image Thumbnail */}
            <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-black/[0.04] transition-transform duration-200 group-hover:scale-[1.02] dark:bg-white/[0.06] sm:w-32">
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        sizes="(min-width: 640px) 128px, 96px"
                        className="object-cover"
                    />
                ) : (
                    <div className="absolute inset-0" />
                )}
            </div>
        </Link>
    );
}
