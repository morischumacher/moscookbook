'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import styles from './page.module.css';

interface User {
    id: number;
    email: string;
    admin: boolean;
}

export default function AdminUsersPage() {
    const t = useTranslations('Admin');
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data.users);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('genericError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleToggleRole = async (userId: number, currentAdminStatus: boolean) => {
        try {
            const res = await fetch(`/api/users/${userId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin: !currentAdminStatus })
            });
            const data = await res.json();

            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, admin: !currentAdminStatus } : u));
            } else {
                alert(data.message || t('genericError'));
            }
        } catch {
            alert(t('genericError'));
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm(t('confirmDeleteUser'))) {
            return;
        }

        try {
            const res = await fetch(`/api/users/${userId}`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (res.ok) {
                setUsers(users.filter(u => u.id !== userId));
            } else {
                alert(data.message || t('genericError'));
            }
        } catch {
            alert(t('genericError'));
        }
    };

    return (
        <div className={styles.container}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className={styles.title}>{t('userManagement')}</h1>
                <button onClick={() => router.push('/admin')} className={styles.btn} style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
                    {t('backToRecipes')}
                </button>
            </div>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            {loading ? (
                <p>{t('loadingUsers')}</p>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{t('columnId')}</th>
                                <th>{t('columnEmail')}</th>
                                <th>{t('columnRole')}</th>
                                <th>{t('columnActions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`${styles.roleBadge} ${user.admin ? styles.adminBadge : styles.userBadge}`}>
                                            {user.admin ? t('roleAdmin') : t('roleUser')}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className={`${styles.btn} ${styles.toggleBtn}`}
                                                onClick={() => handleToggleRole(user.id, user.admin)}
                                            >
                                                {user.admin ? t('revokeAdmin') : t('makeAdmin')}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                className={`${styles.btn} ${styles.deleteBtn}`}
                                            >
                                                {t('delete')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                                        {t('noUsers')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
