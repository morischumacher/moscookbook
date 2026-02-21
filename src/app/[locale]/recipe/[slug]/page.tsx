import { notFound } from 'next/navigation';
import Image from 'next/image';
import { cookies } from 'next/headers';
import ReactMarkdown from 'react-markdown';
import Rating from '@/components/Rating';
import RatingDisplay from '@/components/RatingDisplay';
import FavoriteButton from '@/components/FavoriteButton';
import ViewTracker from '@/components/ViewTracker';
import prisma from '@/lib/prisma';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import styles from './page.module.css';

interface Ingredient {
    item: string;
    amount: string;
}

export default async function RecipePage({
    params
}: {
    params: Promise<{ slug: string; locale: string }>
}) {
    const { slug } = await params;

    const recipeData = await prisma.recipe.findUnique({
        where: { slug },
        include: { images: true, ratings: true }
    });

    if (!recipeData) {
        notFound();
    }

    // Unique View Counting Logic
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    const viewedCookieName = `viewed_recipe_${recipeData.id}`;
    const hasViewed = cookieStore.has(viewedCookieName);

    // Optimistically update the local object for immediate display.
    // The actual database increment and cookie setting happens in the ViewTracker client component
    // via a Route Handler, preventing Server Component cookie modification errors.
    if (!session.user?.admin && !hasViewed) {
        recipeData.views += 1;
    }

    const avgRating = recipeData.ratings.length > 0
        ? recipeData.ratings.reduce((sum, r) => sum + r.value, 0) / recipeData.ratings.length
        : 0;

    let isFavorited = false;
    let userRatingValue = 0;
    if (session.user) {
        const favorite = await prisma.favorite.findUnique({
            where: {
                userId_recipeId: {
                    userId: session.user.id,
                    recipeId: recipeData.id
                }
            }
        });
        isFavorited = !!favorite;

        const userRating = recipeData.ratings.find(r => r.userId === session.user?.id);
        if (userRating) userRatingValue = userRating.value;
    }

    const recipe = {
        ...recipeData,
        imageUrl: recipeData.images[0]?.url || '',
        rating: avgRating
    };

    const ingredients: Ingredient[] = JSON.parse(recipe.ingredients);

    return (
        <article className="w-full pb-32 bg-[#FFF8F0] dark:bg-black min-h-screen">
            <ViewTracker recipeId={recipe.id} />

            {/* Header Section */}
            <header className="container max-w-2xl mx-auto px-4 sm:px-8 pt-8 sm:pt-16">
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[#111] dark:text-[#eee] tracking-tight leading-[1.1] mb-6">
                    {recipe.title}
                    <div className="inline-block ml-4 align-middle">
                        <FavoriteButton recipeId={recipe.id} initialFavorited={isFavorited} disabled={!session.user} />
                    </div>
                </h1>

                <div className="flex flex-col gap-1 py-4 border-y border-gray-200 dark:border-gray-800 my-6">
                    <span className="text-sm text-gray-500 font-medium uppercase tracking-widest">
                        {new Date(recipe.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {recipe.category}{recipe.nationality ? ` • ${recipe.nationality}` : ''}
                    </span>
                </div>

                <div className="mb-8">
                    <RatingDisplay
                        recipeId={recipe.id}
                        initialAverage={recipe.rating}
                        initialCount={recipeData.ratings.length}
                        initialUserRating={userRatingValue}
                        isLoggedIn={!!session.user}
                        views={recipe.views}
                        infoClassName="flex items-center gap-6 text-sm font-semibold text-gray-500 py-3"
                    />
                </div>
            </header>

            {/* Hero Image (Full Bleed on Mobile) */}
            <div className="container max-w-2xl mx-auto px-0 sm:px-8">
                <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] sm:rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 shadow-sm">
                    {recipe.imageUrl ? (
                        <Image src={recipe.imageUrl} alt={recipe.title} fill style={{ objectFit: 'cover' }} className="object-cover" priority />
                    ) : (
                        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800" />
                    )}
                </div>
                {recipe.description && (
                    <p className="mt-8 px-4 sm:px-0 text-xl sm:text-2xl text-[#222] dark:text-gray-300 font-serif italic text-left leading-relaxed">
                        {recipe.description}
                    </p>
                )}
            </div>

            {/* Spacer to guarantee vertical separation on mobile */}
            <div className="h-24 sm:h-32 w-full" aria-hidden="true" />

            {/* Content Section */}
            <div className="container max-w-2xl mx-auto px-4 sm:px-8 font-serif">

                <section className="mb-16">
                    <h2 className="text-2xl font-sans font-bold uppercase tracking-widest text-[#111] dark:text-[#eee] mb-8 border-b-2 border-[#111] dark:border-[#eee] inline-block pb-1">Ingredients</h2>
                    <ul className="flex flex-col gap-4 text-xl text-[#222] dark:text-[#ddd] leading-relaxed">
                        {ingredients.map((ing, idx) => (
                            <li key={idx} className="flex items-baseline border-b border-gray-200 dark:border-gray-800 pb-4">
                                <span className="font-sans font-bold text-[#111] dark:text-[#eee] w-24 sm:w-32 flex-shrink-0">{ing.amount}</span>
                                <span>{ing.item}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-sans font-bold uppercase tracking-widest text-[#111] dark:text-[#eee] mb-8 border-b-2 border-[#111] dark:border-[#eee] inline-block pb-1">Instructions</h2>
                    <div className={`${styles.markdown} text-xl text-[#222] dark:text-[#ddd] leading-relaxed`}>
                        <ReactMarkdown>{recipe.instructions}</ReactMarkdown>
                    </div>
                </section>
            </div>
        </article>
    );
}
