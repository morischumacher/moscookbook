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
                <div className={styles.imagePlaceholder} />
                {/* Placeholder until we have real images or use Next/Image with valid src */}
                {imageUrl && <img src={imageUrl} alt={title} className={styles.image} />}
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
