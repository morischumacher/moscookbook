'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/routing';
import styles from './page.module.css';

export default function LoginPage() {
    const t = useTranslations('Auth');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (res.ok) {
                if (data.admin) {
                    window.location.href = window.location.pathname.replace('/login', '/admin');
                } else {
                    // Redirect to the locale root (home page)
                    window.location.href = window.location.pathname.replace('/login', '');
                }
            } else {
                setError(data.message || t('failed'));
            }
        } catch {
            setError(t('error'));
        }
    };

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit} className={styles.form}>
                <h1 className={styles.title}>{t('loginTitle')}</h1>
                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.group}>
                    <label htmlFor="email">{t('email')}</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={styles.input}
                    />
                </div>

                <div className={styles.group}>
                    <label htmlFor="password">{t('password')}</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className={styles.input}
                    />
                </div>

                <button type="submit" className="btn" style={{ width: '100%' }}>
                    {t('submitLogin')}
                </button>

                <div style={{ marginTop: 'var(--space-md)', textAlign: 'center', fontSize: '0.875rem' }}>
                    {t('needAccount')}{' '}
                    <Link href="/register" style={{ textDecoration: 'underline' }}>
                        {t('registerLink')}
                    </Link>
                </div>
            </form>
        </div>
    );
}
