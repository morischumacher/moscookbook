import { notFound } from 'next/navigation';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import prisma from '@/lib/prisma';
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
        include: { images: true }
    });

    if (!recipeData) {
        notFound();
    }

    // Increment views
    await prisma.recipe.update({
        where: { slug },
        data: { views: { increment: 1 } }
    });

    const recipe = {
        ...recipeData,
        imageUrl: recipeData.images[0]?.url || ''
    };

    const ingredients: Ingredient[] = JSON.parse(recipe.ingredients);

    return (
        <article className={`container ${styles.article}`}>
            <header className={styles.header}>
                <div className={styles.meta}>
                    <span className={styles.category}>{recipe.category}</span>
                    <h1 className={styles.title}>{recipe.title}</h1>
                    <div className={styles.info}>
                        <span>{recipe.nationality}</span>
                        <span>•</span>
                        <span>★ {recipe.rating}</span>
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
