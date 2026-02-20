import { Link } from '@/i18n/routing';
import Image from 'next/image';
import Rating from './Rating';
import styles from './RecipeCard.module.css';

interface RecipeCardProps {
    title: string;
    description: string;
    imageUrl: string;
    slug: string;
    category: string;
    rating: number;
}

export default function RecipeCard({ title, description, imageUrl, slug, category, rating }: RecipeCardProps) {
    return (
        <Link href={`/recipe/${slug}`} className={styles.card}>
            <div className={styles.imageWrapper}>
                {imageUrl ? (
                    <Image src={imageUrl} alt={title} fill style={{ objectFit: 'cover' }} className={styles.image} />
                ) : (
                    <div className={styles.imagePlaceholder} />
                )}
            </div>
            <div className={styles.content}>
                <span className={styles.category}>{category}</span>
                <h3 className={styles.title}>{title}</h3>
                <p className={styles.description}>{description}</p>
                <div className={styles.footer}>
                    <Rating value={rating} />
                </div>
            </div>
        </Link>
    );
}
