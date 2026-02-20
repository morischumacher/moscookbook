import { notFound } from 'next/navigation';
import Image from 'next/image';
import { cookies } from 'next/headers';
import ReactMarkdown from 'react-markdown';
import Rating from '@/components/Rating';
import FavoriteButton from '@/components/FavoriteButton';
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
    const viewedCookieName = `viewed_${slug}`;
    const hasViewed = cookieStore.has(viewedCookieName);

    // Increment only if not admin and hasn't viewed in this session
    if (!session.user?.admin && !hasViewed) {
        await prisma.recipe.update({
            where: { slug },
            data: { views: { increment: 1 } }
        });

        // Set a cookie that expires in 24 hours to prevent spam refreshing
        cookieStore.set(viewedCookieName, 'true', {
            maxAge: 60 * 60 * 24,
            path: '/',
            httpOnly: true,
            sameSite: 'lax'
        });

        // Optimistically update the local object for immediate display
        recipeData.views += 1;
    }

    const avgRating = recipeData.ratings.length > 0
        ? recipeData.ratings.reduce((sum, r) => sum + r.value, 0) / recipeData.ratings.length
        : 0;

    let isFavorited = false;
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
    }

    const recipe = {
        ...recipeData,
        imageUrl: recipeData.images[0]?.url || '',
        rating: avgRating
    };

    const ingredients: Ingredient[] = JSON.parse(recipe.ingredients);

    return (
        <article className={`container ${styles.article}`}>
            <header className={styles.header}>
                <div className={styles.meta}>
                    <span className={styles.category}>{recipe.category}</span>
                    <h1 className={styles.title}>
                        {recipe.title}
                        <FavoriteButton recipeId={recipe.id} initialFavorited={isFavorited} disabled={!session.user} />
                    </h1>
                    <div className={styles.info}>
                        <span>{recipe.nationality}</span>
                        <span>•</span>
                        <div title={!session.user ? "Log in to rate this recipe" : "Click to rate"}>
                            <Rating value={recipe.rating} recipeId={recipe.id} readonly={!session.user} />
                        </div>
                        <span>•</span>
                        <span>{recipe.views} views</span>
                    </div>
                </div>
                <div className={styles.imageWrapper}>
                    {/* Placeholder or real image */}
                    {recipe.imageUrl ? (
                        <img src={recipe.imageUrl} alt={recipe.title} className={styles.image} />
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
