import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import DeleteRecipeButton from '@/components/DeleteRecipeButton';
import styles from './page.module.css';

interface AdminRecipeRow {
    id: number;
    title: string;
    slug: string;
    category: string | null;
    views: number;
}

export default async function AdminDashboard() {
    const t = await getTranslations('Admin');
    const recipes: AdminRecipeRow[] = await prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true, category: true, views: true },
    });

    return (
        <div className={`container ${styles.dashboard}`}>
            <div className={styles.header}>
                <h1>{t('dashboard')}</h1>
                <Link href="/admin/create" className="btn">
                    {t('createNew')}
                </Link>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>{t('columnTitle')}</th>
                            <th>{t('columnCategory')}</th>
                            <th>{t('columnViews')}</th>
                            <th>{t('columnActions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recipes.map(recipe => (
                            <tr key={recipe.id}>
                                <td>{recipe.title}</td>
                                <td>{recipe.category}</td>
                                <td>{recipe.views}</td>
                                <td>
                                    <div className={styles.actions}>
                                        <Link href={`/recipe/${recipe.slug}`} className={styles.viewLink}>{t('view')}</Link>
                                        <Link href={`/admin/edit/${recipe.id}`} className={styles.viewLink} style={{ backgroundColor: 'var(--color-primary)' }}>{t('edit')}</Link>
                                        <DeleteRecipeButton recipeId={recipe.id} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {recipes.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>{t('noRecipes')}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
