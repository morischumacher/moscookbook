'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import styles from './page.module.css';

interface User {
    id: number;
    email: string;
    admin: boolean;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data.users);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
                alert(data.message || 'Failed to update role');
            }
        } catch (err) {
            alert('An error occurred');
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to permanently delete this user? All their ratings and favorites will be permanently lost.')) {
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
                alert(data.message || 'Failed to delete user');
            }
        } catch (err) {
            alert('An error occurred');
        }
    };

    return (
        <div className={styles.container}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className={styles.title}>User Management</h1>
                <button onClick={() => router.push('/admin')} className={styles.btn} style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
                    Return to Dashboard
                </button>
            </div>

            {error && <p style={{ color: 'red' }}>Error: {error}</p>}

            {loading ? (
                <p>Loading users...</p>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`${styles.roleBadge} ${user.admin ? styles.adminBadge : styles.userBadge}`}>
                                            {user.admin ? 'Admin' : 'User'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className={`${styles.btn} ${styles.toggleBtn}`}
                                                onClick={() => handleToggleRole(user.id, user.admin)}
                                            >
                                                {user.admin ? 'Revoke Admin' : 'Make Admin'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                className={`${styles.btn} ${styles.deleteBtn}`}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
                                        No users found.
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
