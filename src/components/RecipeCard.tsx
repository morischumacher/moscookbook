'use client';

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

export default function RecipeCard({ id, title, description, imageUrl, slug, category, rating, createdAt, nationality, isFavorited = false, isLoggedIn = false }: RecipeCardProps) {
    return (
        <Link href={`/recipe/${slug}`} className="flex flex-row justify-between items-start gap-4 py-8 group hover:opacity-75 transition-opacity">
            {/* Left Content */}
            <div className="flex flex-col flex-1 min-w-0 pr-4">
                <h3 className="text-2xl font-bold text-[#111] dark:text-[#eee] mb-2 leading-tight group-hover:underline decoration-1 underline-offset-4">
                    {title}
                </h3>
                <p className="text-base text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 leading-relaxed">
                    {description}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-gray-500 uppercase tracking-widest">
                    <span>{category}</span>
                    {nationality && (
                        <>
                            <span>•</span>
                            <span>{nationality}</span>
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
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                {imageUrl ? (
                    <Image src={imageUrl} alt={title} fill style={{ objectFit: 'cover' }} className="object-cover" />
                ) : (
                    <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800" />
                )}
            </div>
        </Link>
    );
}
