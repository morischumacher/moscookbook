import { Link } from '@/i18n/routing';
import prisma from '@/lib/prisma';
import styles from './page.module.css';

export default async function AdminDashboard() {
    const recipes = await prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' }
    });

    return (
        <div className={`container ${styles.dashboard}`}>
            <div className={styles.header}>
                <h1>Admin Dashboard</h1>
                <Link href="/admin/create" className="btn">
                    + Create New Recipe
                </Link>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Title</th>
                            <th>Category</th>
                            <th>Views</th>
                            <th>Actions</th>
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
                                        <Link href={`/recipe/${recipe.slug}`} className={styles.viewLink}>View</Link>
                                        <Link href={`/admin/edit/${recipe.id}`} className={styles.viewLink} style={{ backgroundColor: 'var(--color-primary)' }}>Edit</Link>
                                        <button className={styles.deleteBtn}>Delete</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {recipes.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>No recipes yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
