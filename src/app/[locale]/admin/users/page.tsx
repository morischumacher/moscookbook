'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useConfirm } from '@/components/ui/useConfirm';

interface User {
    id: number;
    name?: string;
    email: string;
    admin: boolean;
}

export default function AdminUsersPage() {
    const t = useTranslations('Admin');
    const router = useRouter();

    const [ask, dialog] = useConfirm();

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error(t('genericError'));
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
                body: JSON.stringify({ admin: !currentAdminStatus }),
            });
            const data = await res.json();

            if (res.ok) {
                setUsers((current) =>
                    current.map((user) =>
                        user.id === userId ? { ...user, admin: !currentAdminStatus } : user
                    )
                );
            } else {
                await ask({ title: data.message || t('genericError'), kind: 'alert' });
            }
        } catch {
            await ask({ title: t('genericError'), kind: 'alert' });
        }
    };

    const handleDeleteUser = async (userId: number) => {
        const sure = await ask({
            title: t('confirmDeleteUser'),
            confirmLabel: t('delete'),
            destructive: true,
        });
        if (!sure) return;

        try {
            const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
            const data = await res.json();

            if (res.ok) {
                setUsers((current) => current.filter((user) => user.id !== userId));
            } else {
                await ask({ title: data.message || t('genericError'), kind: 'alert' });
            }
        } catch {
            await ask({ title: t('genericError'), kind: 'alert' });
        }
    };

    return (
        <main className="container mx-auto max-w-3xl px-4 pb-32 md:px-8">
            <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-6 pt-12 sm:pt-16">
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {t('userManagement')}
                </h1>
                <button
                    type="button"
                    onClick={() => router.push('/admin')}
                    className="text-sm underline underline-offset-4 hover:text-muted"
                >
                    {t('backToRecipes')}
                </button>
            </header>

            {error && <p className="py-6 text-sm text-danger">{error}</p>}

            {loading ? (
                <p className="py-20 text-center text-muted">{t('loadingUsers')}</p>
            ) : users.length === 0 ? (
                <p className="py-20 text-center text-muted">{t('noUsers')}</p>
            ) : (
                <ul className="divide-y divide-line">
                    {users.map((user) => (
                        <li
                            key={user.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{user.name || user.email}</p>
                                {user.name && (
                                    <p className="truncate text-sm text-muted">{user.email}</p>
                                )}
                            </div>

                            <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-widest ${user.admin
                                    ? 'bg-ink text-page'
                                    : 'border border-line text-muted'
                                    }`}
                            >
                                {user.admin ? t('roleAdmin') : t('roleUser')}
                            </span>

                            <div className="flex shrink-0 items-center gap-3 text-sm">
                                <button
                                    type="button"
                                    onClick={() => handleToggleRole(user.id, user.admin)}
                                    className="underline underline-offset-4 hover:text-muted"
                                >
                                    {user.admin ? t('revokeAdmin') : t('makeAdmin')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="underline underline-offset-4 hover:text-danger"
                                >
                                    {t('delete')}
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {dialog}
        </main>
    );
}
