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
        <article className={`container ${styles.article}`}>
            <ViewTracker recipeId={recipe.id} />
            <header className={styles.header}>
                <div className={styles.meta}>
                    <span className={styles.category}>{recipe.category}</span>
                    <h1 className={styles.title}>
                        {recipe.title}
                        <FavoriteButton recipeId={recipe.id} initialFavorited={isFavorited} disabled={!session.user} />
                    </h1>
                    <RatingDisplay
                        recipeId={recipe.id}
                        initialAverage={recipe.rating}
                        initialCount={recipeData.ratings.length}
                        initialUserRating={userRatingValue}
                        isLoggedIn={!!session.user}
                        views={recipe.views}
                        nationality={recipe.nationality || ''}
                        infoClassName={styles.info}
                    />
                </div>
                <div className={styles.imageWrapper}>
                    {/* Placeholder or real image */}
                    {recipe.imageUrl ? (
                        <Image src={recipe.imageUrl} alt={recipe.title} fill style={{ objectFit: 'cover' }} className={styles.image} />
                    ) : (
                        <div className={styles.imagePlaceholder} />
                    )}
                </div>
                {recipe.description && (
                    <p className={styles.description}>{recipe.description}</p>
                )}
            </header>

            <div className={styles.content}>
                <section className={styles.ingredientsSection}>
                    <h2 className={styles.sectionTitle}>Ingredients</h2>
                    <ul className={styles.ingredientsList}>
                        {ingredients.map((ing, idx) => (
                            <li key={idx} className={styles.ingredient}>
                                <span className={styles.amount}>{ing.amount}</span>
                                <span className={styles.item}>{ing.item}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className={styles.instructionsSection}>
                    <h2 className={styles.sectionTitle}>Instructions</h2>
                    <div className={styles.markdown}>
                        <ReactMarkdown>{recipe.instructions}</ReactMarkdown>
                    </div>
                </section>
            </div>
        </article>
    );
}
